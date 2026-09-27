import type { QuizQuestion } from "./adaptive-quiz.ts";
import type { ExamEvidence, ExamSourceUnitRef } from "./exam-sources.ts";

export type ExamLevel = 1 | 2 | 3;
export type ExamPurpose = "coverage" | "remediation" | "advance" | "review";
export type ExamTopic = {
  id: string; title: string; lectureId: string; lectureTitle: string;
  unitId: string; evidenceIds: string[];
};
export type ExamPlan = {
  id: string; sessionId: string; progressVersion: number; number: number;
  topicId: string; lectureId: string; unitId: string; level: ExamLevel; purpose: ExamPurpose;
};
export type ExamQuestion = QuizQuestion & {
  planId: string; lectureId: string; lectureTitle: string; topicTitle: string; unitId: string;
  level: ExamLevel; purpose: ExamPurpose; evidence: ExamEvidence[];
};
export type ExamAttempt = {
  questionId: string; topicId: string; lectureId: string; unitId: string;
  level: ExamLevel; correct: boolean; stem: string; selected: string; answer: string; teachingPoint: string;
};
export type ExamTopicProgress = {
  correct: number; incorrect: number; targetLevel: ExamLevel;
  levelAttempts: Record<"1" | "2" | "3", number>;
  levelOutcomes: Record<"1" | "2" | "3", boolean[]>;
  consecutiveTargetErrors: number; lastAnswered: number; lastUnitId: string | null; lastSourcePage: number | null; remediationDueAt: number | null;
};
export type ExamProgress = {
  answered: number; correct: number; topics: Record<string, ExamTopicProgress>;
  lecturesAnswered: Record<string, number>; unitsAnswered: Record<string, number>;
  recent: ExamAttempt[]; seenQuestionSignatures: string[]; sessionSeed: number;
};

export const EXAM_BUFFER_SIZE = 5;
export const EXAM_MAX_CONCURRENT_REQUESTS = 2;
export const EXAM_MAX_PARKED_QUESTIONS = 5;
export const EXAM_STARTUP_MAPPING_BUDGET = 10;
export const EXAM_MAPPING_BUDGET_PER_ANSWER = 2;
export const EXAM_MAX_QUESTION_REQUEST_BYTES = 180_000;
export const EXAM_RECENT_ATTEMPTS_IN_PROMPT = 8;
export const EXAM_SIGNATURE_HISTORY = 1_000;

export const freshExamProgress = (seed = 0x51f15e): ExamProgress => ({
  answered: 0, correct: 0, topics: {}, lecturesAnswered: {}, unitsAnswered: {},
  recent: [], seenQuestionSignatures: [], sessionSeed: seed >>> 0,
});

const emptyTopic = (): ExamTopicProgress => ({
  correct: 0, incorrect: 0, targetLevel: 1, levelAttempts: { "1": 0, "2": 0, "3": 0 }, levelOutcomes: { "1": [], "2": [], "3": [] },
  consecutiveTargetErrors: 0, lastAnswered: 0, lastUnitId: null, lastSourcePage: null, remediationDueAt: null,
});
export const getExamTopicProgress = (progress: ExamProgress, id: string) => progress.topics[id] ?? emptyTopic();

export function normalizeExamSignature(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 4_800);
}
export function compactExamSignature(value: string) {
  const normalized = normalizeExamSignature(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    first = Math.imul(first ^ normalized.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ normalized.charCodeAt(index), 0x85ebca6b);
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
}
export function examQuestionSignature(question: Pick<ExamQuestion, "vignette" | "stem">) {
  return normalizeExamSignature(question.vignette + " " + question.stem);
}
function seededScore(progress: ExamProgress, value: string, cycle: number) {
  let hash = progress.sessionSeed || 1;
  const key = cycle + ":" + value;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

export function nextExamPlan(units: ExamSourceUnitRef[], topics: ExamTopic[], progress: ExamProgress, pending: ExamPlan[], sessionId: string): ExamPlan {
  if (!units.length || !topics.length) throw new Error("No mapped exam topics available.");
  const eligible = units.filter((unit) => topics.some((topic) => topic.unitId === unit.id));
  const number = progress.answered + pending.length + 1;
  const candidateUnits = eligible.filter((unit) => (progress.unitsAnswered[unit.id] ?? 0) === 0 && !pending.some((plan) => plan.unitId === unit.id && plan.purpose === "coverage"));
  const candidateLectures = new Set(candidateUnits.map((unit) => unit.lectureId));
  const coverageIsDue = candidateUnits.length > 0 && (
    number <= EXAM_BUFFER_SIZE ||
    number % 3 === 0
  );

  let purpose: ExamPurpose = "review";
  let candidates: ExamTopic[] = [];
  if (coverageIsDue) {
    purpose = "coverage";
    const chosenLecture = [...candidateLectures].sort((a, b) => {
      const plannedA = pending.filter((plan) => plan.lectureId === a && plan.purpose === "coverage").length;
      const plannedB = pending.filter((plan) => plan.lectureId === b && plan.purpose === "coverage").length;
      const coverageA = progress.lecturesAnswered[a] ?? 0;
      const coverageB = progress.lecturesAnswered[b] ?? 0;
      return coverageA + plannedA - coverageB - plannedB || seededScore(progress, a, Math.floor(number / 3)) - seededScore(progress, b, Math.floor(number / 3));
    })[0];
    const chosenUnit = candidateUnits.filter((unit) => unit.lectureId === chosenLecture).sort((a, b) => a.ordinal - b.ordinal)[0];
    candidates = topics.filter((topic) => topic.unitId === chosenUnit.id);
  } else {
    const due = topics.filter((topic) => {
      const state = getExamTopicProgress(progress, topic.id);
      return state.remediationDueAt !== null && state.remediationDueAt <= number &&
        !pending.some((plan) => plan.topicId === topic.id && plan.purpose === "remediation");
    }).sort((a, b) => getExamTopicProgress(progress, a.id).remediationDueAt! - getExamTopicProgress(progress, b.id).remediationDueAt!);
    if (due.length) { purpose = "remediation"; candidates = [due[0]]; }
    else candidates = [...topics].sort((a, b) => {
      const score = (topic: ExamTopic) => {
        const state = getExamTopicProgress(progress, topic.id);
        const outcomes = state.levelOutcomes[String(state.targetLevel) as "1" | "2" | "3"].slice(-4);
        const errorRate = outcomes.length ? (outcomes.length - outcomes.filter(Boolean).length) / outcomes.length : .4;
        const age = Math.min(20, Math.max(0, progress.answered - state.lastAnswered));
        const freshness = state.correct + state.incorrect === 0 ? 1.3 : 0;
        const pendingCount = pending.filter((plan) => plan.topicId === topic.id).length;
        return errorRate * 4 + age * .12 + freshness - pendingCount * 3;
      };
      return score(b) - score(a) || seededScore(progress, a.id, number) - seededScore(progress, b.id, number);
    });
  }

  const pendingIds = new Set(pending.map((plan) => plan.topicId));
  const topic = candidates.find((item) => !pendingIds.has(item.id)) ?? candidates[0];
  if (!topic) throw new Error("No exam topic can be scheduled.");
  const state = getExamTopicProgress(progress, topic.id);
  const level = purpose === "coverage" ? 1 : purpose === "remediation" && state.targetLevel > 1
    ? (state.targetLevel - 1) as ExamLevel : state.targetLevel;
  const unit = eligible.find((item) => item.id === topic.unitId)!;
  return {
    id: sessionId + ":" + number + ":" + progress.answered + ":" + topic.id,
    sessionId, progressVersion: progress.answered, number, topicId: topic.id,
    lectureId: topic.lectureId, unitId: unit.id, level, purpose,
  };
}

export function recordExamAnswer(progress: ExamProgress, question: ExamQuestion, selectedIndex: number): ExamProgress {
  if (!Number.isInteger(selectedIndex) || !question.choices[selectedIndex]) throw new Error("Choose an answer first.");
  const correct = selectedIndex === question.correctIndex;
  const old = getExamTopicProgress(progress, question.topicId);
  const targetLevel = old.targetLevel;
  const levelKey = String(question.level) as "1" | "2" | "3";
  const levelAttempts = { ...old.levelAttempts, [levelKey]: old.levelAttempts[levelKey] + 1 };
  const levelOutcomes = { ...old.levelOutcomes, [levelKey]: [...old.levelOutcomes[levelKey], correct].slice(-4) };
  const consecutiveTargetErrors = question.level === targetLevel ? (correct ? 0 : old.consecutiveTargetErrors + 1) : old.consecutiveTargetErrors;
  let nextLevel = targetLevel;
  if (question.level === targetLevel && consecutiveTargetErrors >= 2 && targetLevel > 1) nextLevel = (targetLevel - 1) as ExamLevel;
  else if (question.level === targetLevel && targetLevel < 3 && levelOutcomes[levelKey].length >= 3 && levelOutcomes[levelKey].slice(-4).filter(Boolean).length >= 3 && correct) nextLevel = (targetLevel + 1) as ExamLevel;
  const topicProgress: ExamTopicProgress = {
    correct: old.correct + (correct ? 1 : 0), incorrect: old.incorrect + (correct ? 0 : 1),
    targetLevel: nextLevel,
    levelAttempts,
    levelOutcomes: nextLevel === targetLevel ? levelOutcomes : { ...levelOutcomes, [String(nextLevel) as "1" | "2" | "3"]: [] },
    consecutiveTargetErrors: nextLevel === targetLevel ? consecutiveTargetErrors : 0,
    lastAnswered: progress.answered + 1,
    lastUnitId: question.unitId, lastSourcePage: question.sourcePages[0] ?? null,
    remediationDueAt: correct ? null : progress.answered + 4,
  };
  const signature = compactExamSignature(question.vignette + " " + question.stem);
  return {
    ...progress, answered: progress.answered + 1, correct: progress.correct + (correct ? 1 : 0),
    topics: { ...progress.topics, [question.topicId]: topicProgress },
    lecturesAnswered: { ...progress.lecturesAnswered, [question.lectureId]: (progress.lecturesAnswered[question.lectureId] ?? 0) + 1 },
    unitsAnswered: { ...progress.unitsAnswered, [question.unitId]: (progress.unitsAnswered[question.unitId] ?? 0) + 1 },
    recent: [...progress.recent, {
      questionId: question.id, topicId: question.topicId, lectureId: question.lectureId, unitId: question.unitId,
      level: question.level, correct, stem: (question.vignette + " " + question.stem).trim().slice(0, 2_400),
      selected: question.choices[selectedIndex].text, answer: question.choices[question.correctIndex].text,
      teachingPoint: question.teachingPoint,
    }].slice(-EXAM_RECENT_ATTEMPTS_IN_PROMPT),
    seenQuestionSignatures: signature ? [...progress.seenQuestionSignatures, signature].slice(-EXAM_SIGNATURE_HISTORY) : progress.seenQuestionSignatures,
  };
}

export function validateExamQuestion(value: unknown, plan: ExamPlan, topic: ExamTopic, evidence: ExamEvidence[]): ExamQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Luna returned an invalid exam question.");
  const q = value as Record<string, unknown>;
  const validString = (candidate: unknown, min: number, max: number): candidate is string => typeof candidate === "string" && candidate.trim().length >= min && candidate.length <= max;
  if (!validString(q.vignette, plan.level === 3 ? 200 : 0, 5_000) || !validString(q.stem, 20, 1_800) || !validString(q.explanation, 30, 5_000) || !validString(q.teachingPoint, 10, 800)) throw new Error("Luna returned incomplete exam feedback.");
  const vignette = q.vignette.trim();
  const stem = q.stem.trim();
  if (plan.level === 3 && vignette.split(/\s+/).length < 45) throw new Error("The clinical question needs a fuller vignette.");
  if (vignette.includes("?") || /(?:^|[.!]\s+)(?:which|what|how|why|who|where|select|choose|identify|determine|name|describe|explain|predict|calculate)\b/i.test(vignette)) throw new Error("Keep the question lead-in in the stem, not the vignette.");
  if (!stem.endsWith("?") || (stem.match(/\?/g)?.length ?? 0) !== 1) throw new Error("The question needs one clear lead-in.");
  if (!Array.isArray(q.reasoningSteps) || q.reasoningSteps.length < (plan.level === 3 ? 2 : 1) || q.reasoningSteps.length > 4 || !q.reasoningSteps.every((step) => validString(step, 15, 1_000))) throw new Error("Luna returned incomplete reasoning steps.");
  if (!Array.isArray(q.choices) || q.choices.length < 4 || q.choices.length > 5 || !q.choices.every((choice) => choice && typeof choice === "object" && validString((choice as Record<string, unknown>).text, 1, 700) && validString((choice as Record<string, unknown>).rationale, 10, 1_800))) throw new Error("The question needs four or five explained answer choices.");
  if (new Set((q.choices as { text: string }[]).map((choice) => choice.text.trim().toLowerCase())).size !== q.choices.length) throw new Error("Luna returned repeated answer choices.");
  if (!Number.isInteger(q.correctIndex) || Number(q.correctIndex) < 0 || Number(q.correctIndex) >= q.choices.length) throw new Error("Luna returned an invalid answer index.");
  const sourceIds = Array.isArray(q.sourceIds) ? q.sourceIds : Array.isArray(q.evidence) ? q.evidence.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" ? [(item as Record<string, unknown>).id] : []) : [];
  if (sourceIds.length < 1 || sourceIds.length > 3 || !sourceIds.every((id) => typeof id === "string" && topic.evidenceIds.includes(id) && evidence.some((item) => item.id === id && item.unitId === plan.unitId && item.lectureId === plan.lectureId))) throw new Error("Luna returned an invalid source reference.");
  const selected = Array.from(new Map((sourceIds as string[]).map((id) => [id, evidence.find((item) => item.id === id)!])).values());
  return {
    id: crypto.randomUUID(), planId: plan.id, topicId: topic.id,
    kind: plan.level === 3 ? "clinical" : "knowledge", difficulty: plan.level,
    vignette, stem, choices: q.choices as QuizQuestion["choices"], correctIndex: Number(q.correctIndex),
    explanation: q.explanation.trim(), teachingPoint: q.teachingPoint.trim(), reasoningSteps: q.reasoningSteps as string[],
    sourcePages: Array.from(new Set(selected.map((item) => item.page))), sourceQuote: selected.map((item) => item.text).join("\n\n"),
    lectureId: plan.lectureId, lectureTitle: topic.lectureTitle, topicTitle: topic.title, unitId: plan.unitId,
    level: plan.level, purpose: plan.purpose, evidence: selected,
  };
}

export function hasExamTopicEvidence(topic: ExamTopic, evidence: ExamEvidence[]) {
  return topic.evidenceIds.length > 0 && topic.evidenceIds.every((id) => evidence.some((item) => item.id === id && item.unitId === topic.unitId && item.lectureId === topic.lectureId));
}
