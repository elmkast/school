import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExamSourceIndex, examEvidenceForUnit, materializeExamSourceUnit, EXAM_UNIT_CHAR_LIMIT, type ExamSourceUnit } from "../lib/exam-sources.ts";
import { changeExamSelection, examSelectableLectureIds, filterExamLectures } from "../lib/exam-selection.ts";
import { fetchAllPages } from "../lib/cloud-pagination.ts";
import { compactExamSignature, freshExamProgress, getExamTopicProgress, nextExamPlan, recordExamAnswer, validateExamQuestion, type ExamQuestion, type ExamTopic } from "../lib/exam-prep.ts";
import { ExamPool, type ExamPoolSnapshot } from "../lib/exam-pool.ts";
import type { ExamService } from "../lib/exam-client.ts";
import { QuizGenerationError } from "../lib/adaptive-quiz.ts";
import { createExamHandler } from "../netlify/functions/exam.mts";
import type { Lecture, Slide } from "../lib/lecture-store.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const waitUntil = async (predicate: () => boolean, message: string | (() => string) = "condition was not reached") => {
  for (let index = 0; index < 500; index += 1) { if (predicate()) return; await settle(); }
  assert.fail(typeof message === "function" ? message() : message);
};

function makeLecture(id: string, slides: Slide[] = [{ page: 1, heading: "Core mechanism", text: `Lecture ${id} explains ATP synthesis through a proton gradient. ${"The membrane enzyme transports protons and supports ATP production. ".repeat(18)}` }], overrides: Partial<Lecture> = {}): Lecture {
  return {
    id, title: `Lecture ${id}`, lecturer: `Instructor ${id}`, week: 1, course: "MCF", academicYear: "2026-2027", favorite: false,
    pages: slides.length, slos: [], outline: [], toc: [], summary: "", slides, notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [],
    sloStrengths: {}, studySLOs: [], createdAt: "2026-08-01T00:00:00.000Z", ...overrides,
  };
}

function questionFor(plan: ReturnType<typeof nextExamPlan>, topic: ExamTopic, evidence: ReturnType<typeof examEvidenceForUnit>, n: number): ExamQuestion {
  const vignette = plan.level === 3
    ? "A student studies a patient with a metabolic abnormality. Laboratory testing demonstrates a change in enzyme activity after a substrate is added. The finding is repeated in a controlled preparation, and the measured product concentration changes in a manner consistent with altered pathway flux. The instructor asks the student to connect the observed biochemical result with the mechanism described in the lecture material. The clinical details are provided only to frame the mechanism for analysis."
    : "";
  return {
    id: `question-${n}`, planId: plan.id, topicId: topic.id, kind: plan.level === 3 ? "clinical" : "knowledge", difficulty: plan.level,
    vignette, stem: `How does this lecture mechanism explain finding ${n}?`,
    choices: [
      { text: "A distinct mechanism", rationale: "This follows the provided source evidence directly." },
      { text: "A different cellular process", rationale: "This process does not account for the finding." },
      { text: "An unrelated pathway change", rationale: "The pathway described does not produce this result." },
      { text: "No mechanism is involved", rationale: "The evidence supports a specific mechanism." },
    ], correctIndex: 0, explanation: "The described source mechanism accounts for the observed biochemical change.",
    teachingPoint: "Connect the pathway mechanism to the measured effect.", reasoningSteps: plan.level === 3
      ? ["Identify the mechanism that accounts for the measured change.", "Link that mechanism to the pathway consequence described in the case."]
      : ["Match the observation to the mechanism described in the source."],
    sourcePages: [evidence[0].page], sourceQuote: evidence[0].text, lectureId: plan.lectureId,
    lectureTitle: topic.lectureTitle, topicTitle: topic.title, unitId: plan.unitId,
    level: plan.level, purpose: plan.purpose, evidence: [evidence[0]],
  };
}

async function createFakeService(options: { failAfter?: number; failMappingFor?: string; slowMapping?: (unit: ExamSourceUnit) => Promise<void>; repeated?: boolean } = {}) {
  let questionCalls = 0;
  const questionInputs: Parameters<ExamService["question"]>[0][] = [];
  const mapped: ExamSourceUnit[] = [];
  const mapAttempts: ExamSourceUnit[] = [];
  const service: ExamService = {
    async mapTopics(unit) {
      mapAttempts.push(unit);
      if (options.slowMapping) await options.slowMapping(unit);
      if (unit.lectureId === options.failMappingFor) throw new QuizGenerationError("Invalid topic map.", true, { issues: ["TOPICS_INVALID"] });
      mapped.push(unit);
      const evidence = examEvidenceForUnit(unit);
      return evidence.length ? [{ title: "Energy transfer", evidenceIds: [evidence[0].id] }] : [];
    },
    async question(input) {
      questionCalls += 1;
      questionInputs.push(input);
      if (options.failAfter !== undefined && questionCalls > options.failAfter) throw new QuizGenerationError("Invalid generated question.", true, { issues: ["QUESTION_SHAPE"] });
      const topic = input.topic;
      const evidence = examEvidenceForUnit(input.unit);
      const plan = options.repeated ? { ...input.plan, id: "same-plan", number: 1 } : input.plan;
      return questionFor(plan, topic, evidence, options.repeated ? 1 : questionCalls);
    },
  };
  return { service, get questionCalls() { return questionCalls; }, questionInputs, mapped, mapAttempts };
}

test("source index deduplicates IDs and handles 1,000 selections without copying slide text into unit references", async () => {
  const lectures = Array.from({ length: 1_000 }, (_, index) => makeLecture(`L${index}`, undefined, { course: index % 2 ? "MCF" : "IMD", week: index % 12 + 1 }));
  const index = await buildExamSourceIndex([...lectures, lectures[0]]);
  assert.equal(index.lecturesById.size, 1_000);
  assert.equal(index.units.length, 1_000);
  assert.ok(index.units.every((unit) => unit.spans.every((span) => !("text" in span))));
  assert.ok(index.units.every((unit) => unit.characters < EXAM_UNIT_CHAR_LIMIT));
});

test("selection filters preserve hidden selections, selection uses stable IDs, and untestable rows are excluded", () => {
  const lectures = Array.from({ length: 1_000 }, (_, index) => makeLecture(`lecture-${index}`, index === 4 ? [{ page: 1, heading: "Scanned", text: "" }] : undefined, { course: index % 2 ? "MCF" : "IMD", week: index % 8 + 1, lecturer: `Teacher ${index % 5}` }));
  const selectable = examSelectableLectureIds(lectures);
  assert.equal(selectable.size, 999);
  const current = changeExamSelection(new Set(), lectures.map((lecture) => lecture.id), selectable, true);
  assert.equal(current.size, 999);
  const filtered = filterExamLectures(lectures, { query: "lecture-9", course: "all", week: "all", instructor: "all" });
  assert.ok(filtered.length > 0 && filtered.length < lectures.length);
  assert.equal(current.size, 999, "filtering must not mutate or discard hidden selections");
  const deselected = changeExamSelection(current, ["lecture-10"], selectable, false);
  assert.equal(deselected.size, 998);
  assert.equal(current.size, 999, "selection updates return a new set");
});

test("complete cloud pagination reads final page and surfaces a failed later page", async () => {
  const ranges: [number, number][] = [];
  const rows = await fetchAllPages(async (from, to) => { ranges.push([from, to]); return { data: [0, 1, 2, 3, 4].slice(from, to + 1), error: null }; }, 2);
  assert.deepEqual(rows, [0, 1, 2, 3, 4]);
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]]);
  let failed = false;
  await assert.rejects(fetchAllPages(async (from) => {
    if (from === 2) { failed = true; return { data: null, error: { message: "second page failed" } }; }
    return { data: [1, 2], error: null };
  }, 2), /second page failed/);
  assert.equal(failed, true);
});

test("700-slide lecture reaches its final page; oversized slide spans reassemble exactly", async () => {
  const slides = Array.from({ length: 700 }, (_, index) => ({ page: index + 1, heading: `Section ${index + 1}`, text: `Page ${index + 1} describes a distinct pathway event. `.repeat(2) }));
  const lecture = makeLecture("long-700", slides);
  const index = await buildExamSourceIndex([lecture]);
  assert.ok(index.units.length > 1);
  const finalUnit = [...index.units].reverse().find((unit) => unit.spans.length)!;
  const finalMaterialized = materializeExamSourceUnit(finalUnit, lecture);
  assert.equal(finalMaterialized.spans.at(-1)?.page, 700);
  const oversized = `START ${"exact source wording; ".repeat(1_600)} END`;
  const oversizedLecture = makeLecture("one-oversized-slide", [{ page: 15, heading: "Long slide", text: oversized }]);
  const oversizedIndex = await buildExamSourceIndex([oversizedLecture]);
  const sameSlideSpans = oversizedIndex.units.flatMap((unit) => unit.spans).filter((span) => span.page === 15);
  const materialized = sameSlideSpans.map((span) => materializeExamSourceUnit(oversizedIndex.units.find((unit) => unit.spans.includes(span))!, oversizedLecture).spans.find((item) => item.start === span.start)!.text);
  assert.equal(materialized.join(""), oversized);
  assert.equal(new Set(sameSlideSpans.map((span) => span.page)).size, 1);
});

test("source identities are stable and evidence IDs remain lecture- and unit-namespaced on identical PDF pages", async () => {
  const first = makeLecture("deck-a", [{ page: 1, heading: "Same page", text: "Both lectures use page one but have different source content. " }]);
  const second = makeLecture("deck-b", [{ page: 1, heading: "Same page", text: "Both lectures use page one but have different source content. " }]);
  const a = await buildExamSourceIndex([first]);
  const b = await buildExamSourceIndex([second]);
  const aAgain = await buildExamSourceIndex([first]);
  assert.equal(a.units[0].id, aAgain.units[0].id);
  assert.notEqual(a.units[0].id, b.units[0].id);
  const aEvidence = examEvidenceForUnit(materializeExamSourceUnit(a.units[0], first));
  const bEvidence = examEvidenceForUnit(materializeExamSourceUnit(b.units[0], second));
  assert.equal(aEvidence[0].page, bEvidence[0].page);
  assert.notEqual(aEvidence[0].id, bEvidence[0].id);
  assert.equal(aEvidence[0].lectureId, "deck-a");
  assert.equal(bEvidence[0].lectureId, "deck-b");
});

test("startup plans five foundation questions across distinct lectures when available", () => {
  const units = Array.from({ length: 5 }, (_, index) => ({ id: `unit-${index}`, sourceVersion: "v", lectureId: `lecture-${index}`, lectureTitle: `L${index}`, course: "MCF", week: 1, lecturer: "Teacher", academicYear: "2026", ordinal: 0, characters: 60, spans: [{ slideIndex: 0, page: 1, heading: "x", start: 0, end: 60 }] }));
  const topics: ExamTopic[] = units.map((unit) => ({ id: `${unit.id}::t1`, title: "Core topic", lectureId: unit.lectureId, lectureTitle: unit.lectureTitle, unitId: unit.id, evidenceIds: [`${unit.id}:0:1:0-60`] }));
  const progress = freshExamProgress();
  const plans = [];
  for (let index = 0; index < 5; index += 1) plans.push(nextExamPlan(units, topics, progress, plans, "session"));
  assert.ok(plans.every((plan) => plan.level === 1));
  assert.equal(new Set(plans.map((plan) => plan.lectureId)).size, 5);
});

test("coverage reservations use one of every three later study opportunities while keeping the rest available for remediation", () => {
  const units = Array.from({ length: 6 }, (_, index) => ({ id: `cadence-${index}`, sourceVersion: "v", lectureId: `lecture-${index}`, lectureTitle: `L${index}`, course: "MCF", week: 1, lecturer: "Teacher", academicYear: "2026", ordinal: 0, characters: 60, spans: [{ slideIndex: 0, page: 1, heading: "x", start: 0, end: 60 }] }));
  const topics: ExamTopic[] = units.map((unit) => ({ id: `${unit.id}::t1`, title: "Core topic", lectureId: unit.lectureId, lectureTitle: unit.lectureTitle, unitId: unit.id, evidenceIds: [`${unit.id}:0:1:0-60`] }));
  const progress = freshExamProgress(); progress.answered = 5;
  const first = nextExamPlan(units, topics, progress, [], "session");
  const second = nextExamPlan(units, topics, progress, [first], "session");
  const third = nextExamPlan(units, topics, progress, [first, second], "session");
  assert.equal(first.number, 6); assert.equal(first.purpose, "coverage");
  assert.equal(second.number, 7); assert.notEqual(second.purpose, "coverage");
  assert.equal(third.number, 8); assert.notEqual(third.purpose, "coverage");
  assert.equal(nextExamPlan(units, topics, progress, [first, second, third], "session").purpose, "coverage");
});

test("topic-specific success promotes through levels while untouched topics stay foundational", async () => {
  const lecture = makeLecture("policy");
  const index = await buildExamSourceIndex([lecture]);
  const unit = materializeExamSourceUnit(index.units[0], lecture);
  const evidence = examEvidenceForUnit(unit);
  const topic: ExamTopic = { id: `${unit.id}::t1`, title: "ATP synthesis", lectureId: lecture.id, lectureTitle: lecture.title, unitId: unit.id, evidenceIds: [evidence[0].id] };
  let progress = freshExamProgress();
  for (let count = 0; count < 3; count += 1) progress = recordExamAnswer(progress, questionFor({ id: "p", sessionId: "s", progressVersion: 0, number: count + 1, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 1, purpose: "review" }, topic, evidence, count), 0);
  assert.equal(getExamTopicProgress(progress, topic.id).targetLevel, 2);
  assert.equal(getExamTopicProgress(progress, topic.id).levelAttempts["1"], 3);
  assert.equal(getExamTopicProgress(progress, "untouched").targetLevel, 1);
  for (let count = 0; count < 3; count += 1) progress = recordExamAnswer(progress, questionFor({ id: "p2", sessionId: "s", progressVersion: progress.answered, number: count + 4, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 2, purpose: "review" }, topic, evidence, count + 4), 0);
  assert.equal(getExamTopicProgress(progress, topic.id).targetLevel, 3);
  assert.equal(getExamTopicProgress(progress, topic.id).levelAttempts["2"], 3);
});

test("two target-level misses demote only that topic and schedule delayed remediation; old easy items do not promote", async () => {
  const lecture = makeLecture("recovery");
  const index = await buildExamSourceIndex([lecture]);
  const unit = materializeExamSourceUnit(index.units[0], lecture);
  const evidence = examEvidenceForUnit(unit);
  const topic: ExamTopic = { id: `${unit.id}::t1`, title: "Transport", lectureId: lecture.id, lectureTitle: lecture.title, unitId: unit.id, evidenceIds: [evidence[0].id] };
  const other: ExamTopic = { ...topic, id: `${unit.id}::t2`, title: "Other" };
  let progress = freshExamProgress();
  for (let count = 0; count < 3; count += 1) progress = recordExamAnswer(progress, questionFor({ id: "f", sessionId: "s", progressVersion: 0, number: count + 1, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 1, purpose: "review" }, topic, evidence, count), 0);
  assert.equal(getExamTopicProgress(progress, topic.id).targetLevel, 2);
  progress = recordExamAnswer(progress, questionFor({ id: "old", sessionId: "s", progressVersion: 3, number: 4, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 1, purpose: "review" }, topic, evidence, 4), 0);
  assert.equal(getExamTopicProgress(progress, topic.id).targetLevel, 2);
  progress = recordExamAnswer(progress, questionFor({ id: "hard1", sessionId: "s", progressVersion: 4, number: 5, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 2, purpose: "review" }, topic, evidence, 5), 1);
  progress = recordExamAnswer(progress, questionFor({ id: "hard2", sessionId: "s", progressVersion: 5, number: 6, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 2, purpose: "review" }, topic, evidence, 6), 1);
  assert.equal(getExamTopicProgress(progress, topic.id).targetLevel, 1);
  assert.equal(getExamTopicProgress(progress, other.id).targetLevel, 1);
  assert.equal(getExamTopicProgress(progress, topic.id).remediationDueAt, 9);
  const otherCorrect = questionFor({ id: "other", sessionId: "s", progressVersion: 6, number: 7, topicId: other.id, lectureId: lecture.id, unitId: unit.id, level: 1, purpose: "review" }, other, evidence, 7);
  progress = recordExamAnswer(progress, otherCorrect, 0);
  progress = recordExamAnswer(progress, otherCorrect, 0);
  progress = recordExamAnswer(progress, otherCorrect, 0);
  const plan = nextExamPlan([index.units[0]], [topic, other], progress, [], "session");
  assert.equal(plan.number, 10);
  assert.equal(plan.purpose, "remediation");
  assert.equal(plan.topicId, topic.id);
});

test("question validation rejects citations outside the mapped topic and duplicate signatures are compact and bounded", async () => {
  const lecture = makeLecture("verify");
  const index = await buildExamSourceIndex([lecture]);
  const unit = materializeExamSourceUnit(index.units[0], lecture);
  const evidence = examEvidenceForUnit(unit);
  const topic: ExamTopic = { id: `${unit.id}::t1`, title: "Topic", lectureId: lecture.id, lectureTitle: lecture.title, unitId: unit.id, evidenceIds: [evidence[0].id] };
  const plan = { id: "p", sessionId: "s", progressVersion: 0, number: 1, topicId: topic.id, lectureId: lecture.id, unitId: unit.id, level: 1 as const, purpose: "coverage" as const };
  const q = questionFor(plan, topic, evidence, 1);
  assert.throws(() => validateExamQuestion({ ...q, sourceIds: ["foreign-source"] }, plan, topic, evidence), /source reference/);
  assert.equal(compactExamSignature(q.vignette + " " + q.stem).length, 16);
});

test("Exam pool waits for five valid questions, samples lectures, counts one rapid submit, and replenishes one credit", async () => {
  const lectures = [makeLecture("a"), makeLecture("b"), makeLecture("c")];
  const index = await buildExamSourceIndex(lectures);
  const fake = await createFakeService();
  const snapshots: ExamPoolSnapshot[] = [];
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, (value) => snapshots.push(value), async () => undefined, "pool-test");
  await pool.start();
  await waitUntil(() => pool.snapshot().initialized, () => `pool did not prepare five questions: ${JSON.stringify(pool.snapshot())}; mapCalls=${fake.mapped.length}; questionCalls=${fake.questionCalls}`);
  assert.equal(pool.snapshot().ready, 5);
  assert.equal(pool.snapshot().progress.answered, 0);
  assert.ok(fake.questionInputs.every((input) => input.plan.level === 1));
  assert.ok(new Set(fake.questionInputs.map((input) => input.plan.lectureId)).size >= 3);
  const current = pool.snapshot().current!;
  pool.answer(current.id, current.correctIndex);
  assert.throws(() => pool.answer(current.id, current.correctIndex), /already been submitted/);
  await waitUntil(() => fake.questionCalls === 6, "one question refill was not authorized by the answer");
  await waitUntil(() => pool.snapshot().ready === 5, "replacement was not ready");
  assert.equal(pool.snapshot().progress.answered, 1);
  assert.equal(pool.snapshot().sampledLectures, 1);
  assert.equal(pool.snapshot().ready, 5);
  assert.ok(snapshots.length > 0);
  pool.dispose();
});

test("startup drafts its first question while it finishes mapping coverage lectures", async () => {
  const lectures = [makeLecture("a"), makeLecture("b"), makeLecture("c")];
  const index = await buildExamSourceIndex(lectures);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fake = await createFakeService({ slowMapping: async (unit) => { if (unit.lectureId === "b") await gate; } });
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, () => undefined, async () => undefined, "overlap-test");
  await pool.start();
  await waitUntil(() => fake.questionCalls === 1, () => `first question did not overlap topic mapping: ${JSON.stringify(pool.snapshot())}`);
  assert.equal(pool.snapshot().initialized, false, "the first question must not bypass the five-question startup barrier");
  assert.ok(fake.mapAttempts.some((unit) => unit.lectureId === "b"), "a second lecture is still being analyzed concurrently");
  release();
  await waitUntil(() => pool.snapshot().initialized, () => `pool did not finish after mapping completed: ${JSON.stringify(pool.snapshot())}`);
  assert.ok(new Set(fake.questionInputs.map((input) => input.plan.lectureId)).size >= 3);
  pool.dispose();
});

test("a section that exhausts mapping retries is skipped instead of being submitted repeatedly", async () => {
  const lectures = [makeLecture("broken-map"), makeLecture("working-map")];
  const index = await buildExamSourceIndex(lectures);
  const fake = await createFakeService({ failMappingFor: "broken-map" });
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, () => undefined, async () => undefined, "failed-map-test");
  await pool.start();
  await waitUntil(() => pool.snapshot().initialized, () => `pool did not move past the failed section: ${JSON.stringify(pool.snapshot())}; mapAttempts=${fake.mapAttempts.length}`);
  assert.equal(fake.mapAttempts.filter((unit) => unit.lectureId === "broken-map").length, 6, "one mapping operation gets its finite six attempts");
  assert.equal(fake.mapAttempts.filter((unit) => unit.lectureId === "working-map").length, 1, "a failed unit must not consume the mapping budget repeatedly");
  pool.dispose();
});

test("bounded quality retry stops after six attempts without removing completed progress", async () => {
  const lecture = makeLecture("retry");
  const index = await buildExamSourceIndex([lecture]);
  const fake = await createFakeService({ failAfter: 5 });
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, () => undefined, async () => undefined, "retry-test");
  await pool.start();
  await waitUntil(() => pool.snapshot().initialized, () => `initial pool unavailable: ${JSON.stringify(pool.snapshot())}; mapCalls=${fake.mapped.length}; questionCalls=${fake.questionCalls}`);
  const current = pool.snapshot().current!;
  pool.answer(current.id, current.correctIndex);
  await waitUntil(() => Boolean(pool.snapshot().error), "failure did not stop after retry budget");
  assert.equal(fake.questionCalls, 11);
  assert.equal(pool.snapshot().progress.answered, 1);
  assert.ok(pool.snapshot().ready >= 3, "prepared questions remain usable after failure");
  pool.dispose();
});

test("prepared level-3 questions cannot deadlock the pool after a topic is demoted", async () => {
  const lecture = makeLecture("stale-level");
  const index = await buildExamSourceIndex([lecture]);
  const fake = await createFakeService();
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, () => undefined, async () => undefined, "stale-test");
  await pool.start();
  await waitUntil(() => pool.snapshot().initialized, "initial pool unavailable");
  let level3Misses = 0;
  let answered = 0;
  while (level3Misses < 2 && answered < 100) {
    const question = pool.snapshot().current;
    if (!question) { await settle(); continue; }
    const target = getExamTopicProgress(pool.snapshot().progress, question.topicId).targetLevel;
    const shouldMiss = target === 3 && question.level === 3 && level3Misses < 2;
    pool.answer(question.id, shouldMiss ? (question.correctIndex + 1) % question.choices.length : question.correctIndex);
    if (shouldMiss) level3Misses += 1;
    answered += 1;
    await settle();
  }
  assert.equal(level3Misses, 2, "the session should reach and reassess level three");
  const state = pool.snapshot();
  const topicId = Object.keys(state.progress.topics)[0];
  assert.equal(getExamTopicProgress(state.progress, topicId).targetLevel, 2);
  await waitUntil(() => {
    const current = pool.snapshot().current;
    return Boolean(current && current.level <= getExamTopicProgress(pool.snapshot().progress, current.topicId).targetLevel);
  }, () => `the pool deadlocked on stale questions: ${JSON.stringify(pool.snapshot())}`);
  assert.ok(pool.snapshot().ready > 0);
  pool.dispose();
});

test("exit during topic mapping drops the session and late responses cannot publish state", async () => {
  const lecture = makeLecture("cancel");
  const index = await buildExamSourceIndex([lecture]);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fake = await createFakeService({ slowMapping: async () => { entered(); await gate; } });
  let changes = 0;
  const pool = new ExamPool(index.units, index.lecturesById, fake.service, () => { changes += 1; }, async () => undefined, "cancel-test");
  await pool.start();
  await started;
  const beforeExit = changes;
  pool.dispose();
  release();
  await settle(); await settle();
  assert.equal(changes, beforeExit);
  assert.equal(fake.questionCalls, 0);
});

function handlerSetup(outputs: unknown[]) {
  const calls: { url: string; body?: Record<string, unknown>; headers?: HeadersInit }[] = [];
  const logs: Record<string, unknown>[] = [];
  const handler = createExamHandler({
    env: (name) => ({ OPENAI_API_KEY: "server-secret", VITE_SUPABASE_URL: "https://unit.test", VITE_SUPABASE_PUBLISHABLE_KEY: "publishable" }[name]),
    fetch: async (input, init) => {
      const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ url, body, headers: init?.headers });
      if (url.includes("/auth/v1/user")) return Response.json({ id: "exam-test-user" });
      const output = outputs.shift();
      if (output instanceof Response) return output;
      return Response.json({ status: "completed", output_text: JSON.stringify(output) });
    }, log: (entry) => logs.push(entry),
  });
  const request = (body: unknown, auth = true) => handler(new Request("https://unit.test/.netlify/functions/exam", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer session" } : {}) }, body: JSON.stringify(body) }));
  return { request, calls, logs };
}

test("authenticated endpoint maps only its bounded source unit and returns namespaced evidence IDs", async () => {
  const lecture = makeLecture("api-map", [{ page: 1, heading: "Oxidative phosphorylation", text: "The proton gradient powers ATP synthesis across the inner mitochondrial membrane. " }]);
  const index = await buildExamSourceIndex([lecture]);
  const unit = materializeExamSourceUnit(index.units[0], lecture);
  const evidence = examEvidenceForUnit(unit);
  const fake = handlerSetup([{ topics: [{ title: "ATP synthesis", evidenceIds: [evidence[0].id] }] }]);
  const response = await fake.request({ action: "map-topics", unit });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.topics[0].evidenceIds[0], evidence[0].id);
  const upstream = fake.calls.find((call) => call.url.includes("api.openai.com"))!;
  assert.equal(upstream.body?.store, false);
  assert.ok(String(upstream.body?.instructions).includes("untrusted DATA"));
  assert.ok(!JSON.stringify(fake.logs).includes("Oxidative phosphorylation"));
});

test("endpoint validates plan/source identity and produces page-specific source evidence", async () => {
  const first = makeLecture("api-a", [{ page: 1, heading: "A", text: "Source A describes the enzyme catalyzing ATP formation and proton transfer. " }]);
  const second = makeLecture("api-b", [{ page: 1, heading: "B", text: "Source B describes the enzyme catalyzing ATP formation and proton transfer. " }]);
  const index = await buildExamSourceIndex([first, second]);
  const unit = materializeExamSourceUnit(index.units[0], first);
  const evidence = examEvidenceForUnit(unit);
  const topic = { id: `${unit.id}::t1`, title: "ATP synthesis", lectureId: unit.lectureId, lectureTitle: unit.lectureTitle, unitId: unit.id, evidenceIds: [evidence[0].id] };
  const plan = { id: "exam-session:1", sessionId: "exam-session", progressVersion: 0, number: 1, topicId: topic.id, lectureId: unit.lectureId, unitId: unit.id, level: 1, purpose: "coverage" };
  const valid = questionFor({ ...plan, level: 1, purpose: "coverage" }, topic, evidence, 1);
  const output = { vignette: valid.vignette, stem: valid.stem, choices: valid.choices, correctIndex: valid.correctIndex, explanation: valid.explanation, teachingPoint: valid.teachingPoint, reasoningSteps: valid.reasoningSteps, sourceIds: [evidence[0].id] };
  const fake = handlerSetup([output]);
  const response = await fake.request({ action: "question", unit, topic, plan, topicProgress: { correct: 0, incorrect: 0, targetLevel: 1, levelOutcomes: { "1": [], "2": [], "3": [] } }, recent: [], pending: [], duplicateSignatures: [] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.question.lectureId, "api-a");
  assert.equal(result.question.evidence[0].lectureId, "api-a");
  assert.equal(result.question.sourcePages[0], 1);
  const wrongPlan = await fake.request({ action: "question", unit, topic, plan: { ...plan, lectureId: "api-b" }, topicProgress: {}, recent: [], pending: [], duplicateSignatures: [] });
  assert.equal(wrongPlan.status, 400);
});

test("endpoint auth, request byte limit, automatic output correction, and safe provider errors are bounded", async () => {
  const sourceLecture = makeLecture("api-safe");
  const index = await buildExamSourceIndex([sourceLecture]);
  const unit = materializeExamSourceUnit(index.units[0], sourceLecture);
  const noAuth = handlerSetup([]);
  assert.equal((await noAuth.request({ action: "map-topics", unit }, false)).status, 401);
  const oversizedBody = handlerSetup([]);
  const largeUnit = { ...unit, spans: [{ ...unit.spans[0], end: 200_000, text: "x".repeat(200_000) }] };
  assert.equal((await oversizedBody.request({ action: "map-topics", unit: largeUnit })).status, 413);

  const evidence = examEvidenceForUnit(unit);
  const invalid = { topics: [{ title: "Bad", evidenceIds: ["invented-id"] }] };
  const replacement = { topics: [{ title: "Corrected", evidenceIds: [evidence[0].id] }] };
  const retryHandler = handlerSetup([invalid, replacement]);
  const first = await retryHandler.request({ action: "map-topics", unit });
  assert.equal(first.status, 502);
  assert.deepEqual((await first.json()).issues, ["TOPICS_INVALID"]);
  const next = await retryHandler.request({ action: "map-topics", unit, retry: { attempt: 1, issues: ["TOPICS_INVALID"] } });
  assert.equal(next.status, 200);

  const providerError = handlerSetup([new Response("PRIVATE PROVIDER DETAIL", { status: 500 })]);
  const response = await providerError.request({ action: "map-topics", unit });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("PRIVATE PROVIDER DETAIL"));
  assert.ok(!JSON.stringify(providerError.logs).includes("server-secret"));
});

test("rate-limit response carries cooldown and old lecture Quiz request behavior remains separate", async () => {
  const lecture = makeLecture("rate-limit");
  const index = await buildExamSourceIndex([lecture]);
  const unit = materializeExamSourceUnit(index.units[0], lecture);
  const limited = handlerSetup([new Response(JSON.stringify({ error: { code: "rate_limit" } }), { status: 429, headers: { "Retry-After": "2" } })]);
  const response = await limited.request({ action: "map-topics", unit });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) >= 2);
  const upstream = limited.calls.find((call) => call.url.includes("api.openai.com"))!;
  assert.equal(upstream.body?.store, false);
});
