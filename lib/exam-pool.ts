import { QuizGenerationError, shuffleQuizChoices } from "./adaptive-quiz.ts";
import { examEvidenceForUnit, materializeExamSourceUnit, type ExamSourceUnitRef } from "./exam-sources.ts";
import { compactExamSignature, EXAM_BUFFER_SIZE, EXAM_MAPPING_BUDGET_PER_ANSWER, EXAM_MAX_CONCURRENT_REQUESTS, EXAM_MAX_PARKED_QUESTIONS, EXAM_STARTUP_MAPPING_BUDGET, freshExamProgress, getExamTopicProgress, nextExamPlan, recordExamAnswer, validateExamQuestion, type ExamPlan, type ExamProgress, type ExamQuestion, type ExamTopic } from "./exam-prep.ts";
import type { ExamRetry, ExamService } from "./exam-client.ts";
import type { Lecture } from "./lecture-store.ts";
import { withExamDeadline } from "./exam-transport.ts";

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new Error("Cancelled")); return; }
  const cancel = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, milliseconds);
  signal.addEventListener("abort", cancel, { once: true });
});

type QuestionSlot = { plan: ExamPlan; state: "waiting" | "loading" | "ready" | "failed"; question?: ExamQuestion; error?: string };
type Mapping = { topics: ExamTopic[]; status: "ready" | "empty" | "failed" };
export type ExamPoolSnapshot = {
  progress: ExamProgress; current: ExamQuestion | null; ready: number; initialized: boolean;
  busy: boolean; error: string; retrying: boolean; mappingRetrying: boolean; questionRetrying: boolean;
  mappingActive: boolean; mappedUnits: number; totalUnits: number;
  eligibleUnits: number; sampledLectures: number; selectedLectures: number; parked: number;
};

export class ExamPool {
  private controller = new AbortController();
  private readonly units: ExamSourceUnitRef[];
  private readonly unitsById: Map<string, ExamSourceUnitRef>;
  private readonly lecturesById: Map<string, Lecture>;
  private readonly service: ExamService;
  private readonly changed: (snapshot: ExamPoolSnapshot) => void;
  private readonly sleep: typeof wait;
  private readonly sessionId: string;
  private progress: ExamProgress;
  private mappings = new Map<string, Mapping>();
  private mappingInFlight = new Map<string, Promise<void>>();
  private slots: QuestionSlot[] = [];
  private parked: QuestionSlot[] = [];
  private active = 0;
  private retryCount = 0;
  private mappingRetryCount = 0;
  private questionRetryCount = 0;
  private mappingOperations = 0;
  private questionOperations = 0;
  private mappingBudget = EXAM_STARTUP_MAPPING_BUDGET;
  private error = "";
  private initialized = false;
  private started = false;
  private currentQuestionId: string | null = null;
  private cooldownUntil = 0;
  private cooldownWakeScheduled = false;
  private mappingsSinceAnswer = 0;

  constructor(units: ExamSourceUnitRef[], lecturesById: Map<string, Lecture>, service: ExamService, changed: (snapshot: ExamPoolSnapshot) => void, sleep = wait, sessionId = crypto.randomUUID()) {
    this.units = units;
    this.unitsById = new Map(units.map((unit) => [unit.id, unit]));
    this.lecturesById = lecturesById;
    this.service = service;
    this.changed = changed;
    this.sleep = sleep;
    this.sessionId = sessionId;
    this.progress = freshExamProgress(this.hashSeed(sessionId));
  }

  private hashSeed(value: string) {
    let seed = 0x51f15e;
    for (let index = 0; index < value.length; index += 1) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619) >>> 0;
    return seed || 1;
  }

  snapshot(): ExamPoolSnapshot {
    const current = this.currentQuestionId ? this.slots.find((slot) => slot.question?.id === this.currentQuestionId)?.question ?? null : null;
    const eligibleUnits = this.eligibleUnits();
    const selectedLectures = new Set(this.units.map((unit) => unit.lectureId));
    const sampledLectures = [...selectedLectures].filter((id) => (this.progress.lecturesAnswered[id] ?? 0) > 0).length;
    return {
      progress: this.progress, current, ready: this.slots.filter((slot) => slot.state === "ready").length,
      initialized: this.initialized, busy: !this.error && (this.active > 0 || this.slots.some((slot) => slot.state === "waiting" || slot.state === "loading")),
      error: this.error || this.slots.find((slot) => slot.state === "failed")?.error || "",
      retrying: this.retryCount > 0, mappingRetrying: this.mappingRetryCount > 0,
      questionRetrying: this.questionRetryCount > 0, mappingActive: this.mappingInFlight.size > 0,
      mappedUnits: this.mappings.size, totalUnits: this.units.length, eligibleUnits: eligibleUnits.length,
      sampledLectures, selectedLectures: selectedLectures.size,
      parked: this.parked.length,
    };
  }

  private emit() {
    if (!this.controller.signal.aborted) this.changed(this.snapshot());
  }

  private report(event: Record<string, unknown>) {
    try { this.service.diagnostic?.({
      version: "exam-v2", session: this.sessionId, readySlots: this.slots.filter((slot) => slot.state === "ready").length,
      parkedSlots: this.parked.length, activeRequests: this.active, mappedUnits: this.mappings.size,
      questionOperations: this.questionOperations, mappingOperations: this.mappingOperations, ...event,
    }); } catch { /* Diagnostics never interrupt study. */ }
  }

  private eligibleUnits() {
    return this.units.filter((unit) => this.mappings.get(unit.id)?.topics.length);
  }

  private availableTopics() {
    return [...this.mappings.values()].filter((mapping) => mapping.status === "ready").flatMap((mapping) => mapping.topics);
  }

  private mappedLectureIds() {
    return new Set([...this.mappings.values()].flatMap((mapping) => mapping.topics.map((topic) => topic.lectureId)));
  }

  private unansweredMappingUnit() {
    const pending = new Set(this.mappingInFlight.keys());
    const mappedLectures = this.mappedLectureIds();
    for (const id of pending) {
      const unit = this.unitsById.get(id);
      if (unit) mappedLectures.add(unit.lectureId);
    }
    const mappedUnitsByLecture = new Map<string, number>();
    for (const id of this.mappings.keys()) {
      const unit = this.unitsById.get(id);
      if (unit) mappedUnitsByLecture.set(unit.lectureId, (mappedUnitsByLecture.get(unit.lectureId) ?? 0) + 1);
    }
    return this.units
      .filter((unit) => !["ready", "empty", "failed"].includes(this.mappings.get(unit.id)?.status ?? "") && !pending.has(unit.id))
      .sort((a, b) => {
        const lectureA = this.progress.lecturesAnswered[a.lectureId] ?? 0;
        const lectureB = this.progress.lecturesAnswered[b.lectureId] ?? 0;
        const mappedA = mappedLectures.has(a.lectureId) ? 1 : 0;
        const mappedB = mappedLectures.has(b.lectureId) ? 1 : 0;
        const unitCountA = mappedUnitsByLecture.get(a.lectureId) ?? 0;
        const unitCountB = mappedUnitsByLecture.get(b.lectureId) ?? 0;
        return mappedA - mappedB || lectureA - lectureB || unitCountA - unitCountB || a.ordinal - b.ordinal;
      })[0];
  }

  private startupNeedsCoverage() {
    const selected = new Set(this.units.map((unit) => unit.lectureId)).size;
    return this.progress.answered === 0 && this.mappedLectureIds().size < Math.min(5, selected);
  }

  private shouldMap() {
    if (this.mappingOperations >= this.mappingBudget) return false;
    if (!this.unansweredMappingUnit()) return false;
    if (this.startupNeedsCoverage()) {
      const reservedLectures = this.mappedLectureIds();
      for (const id of this.mappingInFlight.keys()) {
        const unit = this.unitsById.get(id);
        if (unit) reservedLectures.add(unit.lectureId);
      }
      return reservedLectures.size < Math.min(EXAM_BUFFER_SIZE, new Set(this.units.map((unit) => unit.lectureId)).size);
    }
    if (!this.availableTopics().length) return true;
    return this.progress.answered > 0 && this.progress.answered % 3 === 0 && this.mappingsSinceAnswer < EXAM_MAPPING_BUDGET_PER_ANSWER;
  }

  private maxQuestionOperations() {
    return EXAM_BUFFER_SIZE + this.progress.answered + Math.floor(this.progress.answered / 5);
  }

  private pendingPlans() {
    return this.slots.map((slot) => slot.plan);
  }

  private restoreParkedQuestions() {
    while (this.slots.length < EXAM_BUFFER_SIZE) {
      const usable = this.parked.flatMap((slot, index) => {
        const question = slot.question;
        if (!question || question.level > getExamTopicProgress(this.progress, question.topicId).targetLevel) return [];
        return [{ slot, index }];
      });
      if (!usable.length) return;
      const unsampled = this.units.some((unit) => this.eligibleUnits().some((candidate) => candidate.lectureId === unit.lectureId) && !(this.progress.lecturesAnswered[unit.lectureId] ?? 0));
      usable.sort((a, b) => {
        const coverageA = a.slot.plan.purpose === "coverage" && unsampled ? 0 : 1;
        const coverageB = b.slot.plan.purpose === "coverage" && unsampled ? 0 : 1;
        return coverageA - coverageB || b.slot.plan.number - a.slot.plan.number;
      });
      const chosen = usable[0];
      this.parked.splice(chosen.index, 1);
      this.slots.push({ ...chosen.slot, state: "ready" });
    }
  }

  async start() {
    if (this.started || this.controller.signal.aborted) return;
    this.started = true;
    if (!this.units.length) {
      this.error = "Select at least one lecture with readable text.";
      this.emit();
      return;
    }
    this.emit();
    this.pump();
  }

  private pump() {
    if (this.controller.signal.aborted || !this.started) return;
    // Terminal failures must reach React, not leave the last busy snapshot on screen.
    if (this.error) { this.emit(); return; }
    const signal = this.controller.signal;
    if (this.cooldownUntil > Date.now()) {
      if (!this.cooldownWakeScheduled) {
        this.cooldownWakeScheduled = true;
        const remaining = this.cooldownUntil - Date.now();
        void this.sleep(remaining, signal).catch(() => undefined).finally(() => {
          this.cooldownWakeScheduled = false;
          if (!signal.aborted) this.pump();
        });
      }
      this.emit();
      return;
    }
    this.restoreParkedQuestions();
    while (this.active < EXAM_MAX_CONCURRENT_REQUESTS) {
      const topics = this.availableTopics();
      const startup = !this.initialized && this.progress.answered === 0;
      const unreservedTopics = topics.filter((topic) => !this.pendingPlans().some((plan) => plan.lectureId === topic.lectureId));
      // Draft as soon as one source is ready. Mapping and drafting share two lanes;
      // reserve distinct lectures for startup without waiting for the entire library.
      const coverageWorkRemains = this.startupNeedsCoverage() &&
        (this.mappingInFlight.size > 0 || (this.mappingOperations < this.mappingBudget && Boolean(this.unansweredMappingUnit())));
      const draftTopics = startup && coverageWorkRemains ? unreservedTopics : topics;
      const questionFirst = startup && unreservedTopics.length > 0;
      if (draftTopics.length && (questionFirst || !this.shouldMap()) && this.slots.length < EXAM_BUFFER_SIZE && this.questionOperations < this.maxQuestionOperations()) {
        const plan = nextExamPlan(this.eligibleUnits(), draftTopics, this.progress, this.pendingPlans(), this.sessionId);
        // Parking can reuse a queue position, but never an operation identity.
        plan.id = this.sessionId + ":operation:" + (this.questionOperations + 1);
        const slot: QuestionSlot = { plan, state: "loading" };
        this.slots.push(slot);
        this.questionOperations += 1;
        this.active += 1;
        void this.generate(slot);
        continue;
      }
      if (this.shouldMap()) {
        const unit = this.unansweredMappingUnit();
        if (unit) {
          this.mappingOperations += 1;
          this.mappingsSinceAnswer += 1;
          this.active += 1;
          this.mappingInFlight.set(unit.id, Promise.resolve());
          void this.mapUnit(unit);
          continue;
        }
      }
      break;
    }
    if (!this.active && !this.slots.some((slot) => slot.state === "ready" || slot.state === "loading" || slot.state === "waiting") && !this.error) {
      const haveTopics = this.availableTopics().length > 0;
      const exhausted = this.mappingOperations >= this.mappingBudget || !this.unansweredMappingUnit();
      if (exhausted) {
        const mappingFailed = [...this.mappings.values()].some((mapping) => mapping.status === "failed");
        this.error = haveTopics
          ? "Exam Prep needs another answer before it can explore more lecture sections."
          : mappingFailed
            ? "Luna could not map some initial lecture sections after automatic retries. Exit and try another selection."
            : "No testable material was found in the initial lecture sections. Select another lecture section and try again.";
      }
    }
    this.maybeInitialize();
    this.emit();
  }

  private maybeInitialize() {
    if (this.initialized || this.error || this.slots.length !== EXAM_BUFFER_SIZE || !this.slots.every((slot) => slot.state === "ready")) return;
    this.initialized = true;
    this.currentQuestionId = this.chooseReadyQuestion()?.question?.id ?? null;
  }

  private chooseReadyQuestion() {
    const ready = this.slots.filter((slot) => slot.state === "ready" && slot.question);
    if (!ready.length) return undefined;
    const nextNumber = this.progress.answered + 1;
    const due = ready.filter((slot) => {
      const dueAt = getExamTopicProgress(this.progress, slot.plan.topicId).remediationDueAt;
      return slot.plan.purpose === "remediation" && dueAt !== null && dueAt <= nextNumber;
    });
    const coverage = ready.filter((slot) => slot.plan.purpose === "coverage");
    const unsampled = this.eligibleUnits().some((unit) => !(this.progress.unitsAnswered[unit.id] ?? 0));
    const coverageDueNow = this.progress.answered < EXAM_BUFFER_SIZE || (nextNumber % 3 === 0);
    if (unsampled && coverageDueNow && coverage.length) return coverage.sort((a, b) => a.plan.number - b.plan.number)[0];
    if (due.length) return due.sort((a, b) => a.plan.number - b.plan.number)[0];
    const ordered = [...ready].sort((a, b) => {
      const early = (slot: QuestionSlot) => {
        const dueAt = getExamTopicProgress(this.progress, slot.plan.topicId).remediationDueAt;
        return dueAt !== null && dueAt > nextNumber ? 1 : 0;
      };
      return early(a) - early(b);
    });
    const candidate = ordered.find((slot) => {
      const state = getExamTopicProgress(this.progress, slot.plan.topicId);
      return slot.plan.level <= state.targetLevel;
    });
    if (candidate) return candidate;
    const replacementCanArrive = this.active > 0 || (this.slots.length < EXAM_BUFFER_SIZE && this.questionOperations < this.maxQuestionOperations());
    return replacementCanArrive ? undefined : ready[0];
  }

  private async recover<T>(operation: (retry: ExamRetry, signal: AbortSignal) => Promise<T>, stage: "topic-mapping" | "question", plan?: ExamPlan): Promise<T> {
    const signal = this.controller.signal;
    const deadline = Date.now() + 120_000;
    const exhausted = () => new QuizGenerationError("Generation stopped after automatic retries. Prepared questions and progress are safe. Details are in Diagnostics.", false, { code: "TIMEOUT" });
    let issues: string[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const attemptStarted = Date.now();
      if (signal.aborted || this.error) throw new Error(this.error || "Cancelled");
      if (Date.now() >= deadline) throw exhausted();
      if (this.cooldownUntil > Date.now()) {
        await this.sleep(Math.min(this.cooldownUntil - Date.now(), deadline - Date.now()), signal);
        if (Date.now() >= deadline) throw exhausted();
      }
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw exhausted();
        const result = await withExamDeadline((attemptSignal) => operation({ attempt, issues }, attemptSignal), signal, remaining, exhausted);
        if (attempt) this.report({ event: "generation-recovered", stage, level: plan?.level, questionNumber: plan?.number, attempt: attempt + 1, elapsedMs: Date.now() - attemptStarted });
        return result;
      } catch (error) {
        if (signal.aborted) throw error;
        const failure = error instanceof QuizGenerationError ? error : new QuizGenerationError("Exam generation is unavailable.");
        issues = failure.issues;
        if (failure.retryAfterMs > 0) this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + failure.retryAfterMs);
        this.report({ event: "generation-failed", stage, level: plan?.level, questionNumber: plan?.number, attempt: attempt + 1, code: failure.code, issues, elapsedMs: Date.now() - attemptStarted });
        if (!failure.retryable) throw failure;
        if (attempt === 5) throw new QuizGenerationError("Generation stopped after automatic retries. Prepared questions and progress are safe. Details are in Diagnostics.", false, { code: failure.code, issues: failure.issues });
        this.retryCount += 1;
        if (stage === "topic-mapping") this.mappingRetryCount += 1;
        else this.questionRetryCount += 1;
        this.emit();
        const backoff = failure.code === "QUALITY_REJECTED" ? [0, 500, 1_000, 2_000, 3_000] : [2_000, 5_000, 10_000, 20_000, 30_000];
        try { await this.sleep(Math.min(deadline - Date.now(), Math.max(backoff[attempt], failure.retryAfterMs)), signal); }
        finally {
          this.retryCount -= 1;
          if (stage === "topic-mapping") this.mappingRetryCount -= 1;
          else this.questionRetryCount -= 1;
        }
      }
    }
    throw new Error("Generation stopped.");
  }

  private async mapUnit(unitRef: ExamSourceUnitRef) {
    const startedAt = Date.now();
    try {
      const unit = materializeExamSourceUnit(unitRef, this.lecturesById.get(unitRef.lectureId));
      const evidence = examEvidenceForUnit(unit);
      const topics = await this.recover(async (retry, signal) => {
        const candidates = await this.service.mapTopics(unit, signal, retry);
        const mapped = candidates.map((candidate, index) => {
          if (!candidate.title.trim() || !candidate.evidenceIds.length || candidate.evidenceIds.some((id) => !evidence.some((item) => item.id === id))) {
            throw new QuizGenerationError("Luna returned a topic without valid source evidence.", true, { issues: ["TOPICS_INVALID"] });
          }
          return {
            id: unit.id + "::t" + (index + 1), title: candidate.title, lectureId: unit.lectureId,
            lectureTitle: unit.lectureTitle, unitId: unit.id, evidenceIds: [...new Set(candidate.evidenceIds)],
          };
        }).slice(0, 4);
        if (new Set(mapped.map((topic) => topic.title.toLowerCase())).size !== mapped.length) throw new QuizGenerationError("Luna repeated a topic in this source section.", true, { issues: ["TOPICS_INVALID"] });
        return mapped;
      }, "topic-mapping");
      if (this.controller.signal.aborted) return;
      this.mappings.set(unit.id, { topics, status: topics.length ? "ready" : "empty" });
      this.report({ event: "topic-map-complete", unitId: unit.id, candidates: topics.length, sourceCharacters: unit.characters, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      if (this.controller.signal.aborted) return;
      const failure = error instanceof QuizGenerationError ? error : null;
      if (!failure || !["QUALITY_REJECTED", "SOURCE_UNAVAILABLE"].includes(failure.code)) {
        this.error = failure?.message || "Lecture analysis failed. Details are in Diagnostics.";
      }
      this.mappings.set(unitRef.id, { topics: [], status: "failed" });
      this.report({ event: "topic-map-skipped", unitId: unitRef.id, code: failure?.code ?? "MAPPING_FAILED" });
    } finally {
      this.mappingInFlight.delete(unitRef.id);
      this.active -= 1;
      if (!this.controller.signal.aborted) this.pump();
    }
  }

  private async generate(slot: QuestionSlot) {
    const startedAt = Date.now();
    const unitRef = this.units.find((candidate) => candidate.id === slot.plan.unitId);
    const topic = this.availableTopics().find((candidate) => candidate.id === slot.plan.topicId);
    if (!unitRef || !topic) {
      this.active -= 1;
      this.slots = this.slots.filter((candidate) => candidate !== slot);
      this.pump();
      return;
    }
    try {
      const unit = materializeExamSourceUnit(unitRef, this.lecturesById.get(unitRef.lectureId));
      const evidence = examEvidenceForUnit(unit);
      const question = await this.recover(async (retry, signal) => {
        const relevant = this.progress.recent.filter((attempt) => attempt.topicId === topic.id || attempt.lectureId === topic.lectureId).slice(-8);
        const topicProgress = getExamTopicProgress(this.progress, topic.id);
        const result = await this.service.question({
          unit, topic, plan: slot.plan,
          topicProgress: { correct: topicProgress.correct, incorrect: topicProgress.incorrect, targetLevel: topicProgress.targetLevel, levelOutcomes: topicProgress.levelOutcomes },
          recent: relevant,
          pending: this.slots.filter((candidate) => candidate !== slot && candidate.plan.topicId === topic.id).slice(-5).map((candidate) => ({ level: candidate.plan.level, stem: candidate.question?.stem ?? "", purpose: candidate.plan.purpose })),
          duplicateSignatures: this.progress.seenQuestionSignatures,
        }, signal, retry);
        let checked: ExamQuestion;
        try { checked = validateExamQuestion(result, slot.plan, topic, evidence); }
        catch (error) {
          const message = error instanceof Error ? error.message : "Question validation failed.";
          const issue = /source|evidence|reference/i.test(message) ? "SOURCE_REFERENCE" : /vignette|clinical|lead-in/i.test(message) ? "VIGNETTE_FORMAT" : /choice|answer/i.test(message) ? "CHOICES_FORMAT" : "QUESTION_SHAPE";
          throw new QuizGenerationError("Replacing a question that failed validation.", true, { issues: [issue] });
        }
        const signature = compactExamSignature(checked.vignette + " " + checked.stem);
        if (this.progress.seenQuestionSignatures.includes(signature) || this.slots.some((candidate) => candidate !== slot && candidate.question && compactExamSignature(candidate.question.vignette + " " + candidate.question.stem) === signature) || this.parked.some((item) => item.question && compactExamSignature(item.question.vignette + " " + item.question.stem) === signature)) {
          throw new QuizGenerationError("Replacing a repeated Exam Prep question.", true, { issues: ["DUPLICATE_QUESTION"] });
        }
        const shuffled = shuffleQuizChoices(checked);
        return { ...checked, choices: shuffled.choices, correctIndex: shuffled.correctIndex };
      }, "question", slot.plan);
      if (this.controller.signal.aborted) return;
      slot.question = question;
      this.report({ event: "question-ready", level: question.level, questionNumber: slot.plan.number, elapsedMs: Date.now() - startedAt });
      const target = getExamTopicProgress(this.progress, question.topicId).targetLevel;
      const hasSuitableAlternative = this.slots.some((candidate) => candidate !== slot && candidate.state === "ready" && candidate.question && candidate.question.level <= getExamTopicProgress(this.progress, candidate.question.topicId).targetLevel);
      if (question.level > target && this.parked.length < EXAM_MAX_PARKED_QUESTIONS && hasSuitableAlternative) {
        this.parked.push({ ...slot, state: "ready" });
        this.slots = this.slots.filter((candidate) => candidate !== slot);
      } else {
        slot.state = "ready";
      }
    } catch (error) {
      if (!this.controller.signal.aborted) {
        slot.state = "failed";
        slot.error = error instanceof Error ? error.message : "Question generation failed.";
        this.error = slot.error;
      }
    } finally {
      this.active -= 1;
      if (!this.controller.signal.aborted) {
        this.slots = this.slots.filter((candidate) => candidate.state !== "failed");
        if (this.initialized && !this.currentQuestionId) this.currentQuestionId = this.chooseReadyQuestion()?.question?.id ?? null;
        this.maybeInitialize();
        this.pump();
      }
    }
  }

  answer(questionId: string, selectedIndex: number) {
    const current = this.currentQuestionId ? this.slots.find((slot) => slot.question?.id === this.currentQuestionId)?.question : null;
    if (!current || current.id !== questionId || !this.initialized) throw new Error("This exam question has already been submitted.");
    this.progress = recordExamAnswer(this.progress, current, selectedIndex);
    this.slots = this.slots.filter((slot) => slot.question?.id !== current.id);
    this.currentQuestionId = null;
    this.mappingBudget += EXAM_MAPPING_BUDGET_PER_ANSWER;
    this.mappingsSinceAnswer = 0;
    const remaining = this.slots.filter((slot) => slot.state !== "failed");
    for (const slot of remaining) {
      const target = getExamTopicProgress(this.progress, slot.plan.topicId).targetLevel;
      const hasSuitableAlternative = this.slots.some((candidate) => candidate !== slot && candidate.state === "ready" && candidate.question && candidate.question.level <= getExamTopicProgress(this.progress, candidate.question.topicId).targetLevel);
      if (slot.question && slot.question.level > target && this.parked.length < EXAM_MAX_PARKED_QUESTIONS && hasSuitableAlternative) {
        this.parked.push(slot);
        this.slots = this.slots.filter((candidate) => candidate !== slot);
      }
    }
    this.pump();
    this.currentQuestionId = this.chooseReadyQuestion()?.question?.id ?? null;
    this.emit();
  }

  dispose() {
    this.controller.abort();
    this.slots = [];
    this.parked = [];
  }
}
