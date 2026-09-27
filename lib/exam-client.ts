import { supabase } from "./supabase-client.ts";
import { recordDiagnostic } from "./diagnostics.ts";
import { QuizGenerationError } from "./adaptive-quiz.ts";
import { quizServiceFailure } from "./quiz-errors.ts";
import type { ExamPlan, ExamQuestion, ExamTopic } from "./exam-prep.ts";
import type { ExamEvidence, ExamSourceUnit } from "./exam-sources.ts";

export type ExamRetry = { attempt: number; issues: string[] };
export type ExamService = {
  mapTopics(unit: ExamSourceUnit, signal: AbortSignal, retry?: ExamRetry): Promise<{ title: string; evidenceIds: string[] }[]>;
  question(input: {
    unit: ExamSourceUnit; topic: ExamTopic; plan: ExamPlan; topicProgress: unknown;
    recent: unknown[]; pending: { level: number; stem: string; purpose: string }[]; duplicateSignatures: string[];
  }, signal: AbortSignal, retry?: ExamRetry): Promise<ExamQuestion>;
  diagnostic?(event: Record<string, unknown>): void;
};

const MAX_REQUEST_BYTES = 180_000;

async function examRequest(body: Record<string, unknown>, signal: AbortSignal) {
  if (!supabase) throw new QuizGenerationError("Exam Prep needs a signed-in account.", false, { code: "CONFIGURATION" });
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new QuizGenerationError("Exit Exam Prep and sign in again.", false, { code: "AUTHENTICATION" });
  const encoded = JSON.stringify(body);
  if (new TextEncoder().encode(encoded).byteLength > MAX_REQUEST_BYTES) throw new QuizGenerationError("This lecture section is too large to request.", false, { code: "BAD_REQUEST" });
  const started = Date.now();
  const timeout = AbortSignal.timeout(60_000);
  let response: Response;
  try {
    response = await fetch("/.netlify/functions/exam", {
      method: "POST", signal: AbortSignal.any([signal, timeout]),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
      body: encoded,
    });
  } catch {
    if (signal.aborted) throw new Error("Cancelled");
    throw new QuizGenerationError("Waiting for Luna to reconnect.", false, { code: timeout.aborted ? "TIMEOUT" : "TRANSIENT", retryable: true });
  }
  let result: Record<string, unknown>;
  try {
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response.");
    result = value;
  } catch {
    const failure = quizServiceFailure(response.status, null, response.headers.get("Retry-After"));
    recordDiagnostic("app", "Exam response unreadable", { code: failure.code, status: response.status, elapsedMs: Date.now() - started });
    throw failure;
  }
  if (!response.ok) {
    const failure = quizServiceFailure(response.status, result, response.headers.get("Retry-After"));
    const requestId = typeof result.requestId === "string" && /^[a-f0-9-]{36}$/i.test(result.requestId) ? result.requestId : "unavailable";
    recordDiagnostic("app", "Exam generation failed", {
      version: response.headers.get("X-Exam-Version") === "exam-v1" ? "exam-v1" : "unknown",
      requestId, status: response.status, stage: body.action === "map-topics" ? "topic-mapping" : "question",
      code: failure.code, issues: failure.issues, elapsedMs: Date.now() - started, retryAfterMs: failure.retryAfterMs,
    });
    throw failure;
  }
  return result;
}

function isExamEvidence(value: unknown): value is ExamEvidence {
  return Boolean(value && typeof value === "object" && typeof (value as ExamEvidence).id === "string" &&
    typeof (value as ExamEvidence).text === "string" && typeof (value as ExamEvidence).page === "number");
}

export const liveExamService: ExamService = {
  async mapTopics(unit, signal, retry) {
    const result = await examRequest({ action: "map-topics", unit, retry }, signal);
    if (!Array.isArray(result.topics)) throw new QuizGenerationError("Luna returned an invalid topic map.", true, { issues: ["TOPICS_INVALID"] });
    return result.topics.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim() || !Array.isArray(item.evidenceIds) || !item.evidenceIds.every((id) => typeof id === "string")) return [];
      return [{ title: item.title.trim(), evidenceIds: item.evidenceIds as string[] }];
    });
  },
  async question(input, signal, retry) {
    const result = await examRequest({ action: "question", ...input, retry }, signal);
    if (!result.question || typeof result.question !== "object" || !Array.isArray((result.question as { choices?: unknown }).choices) ||
        !Array.isArray((result.question as { evidence?: unknown }).evidence) ||
        !(result.question as { evidence: unknown[] }).evidence.every(isExamEvidence)) {
      throw new QuizGenerationError("Luna returned an incomplete Exam Prep question.", true, { issues: ["QUESTION_SHAPE"] });
    }
    return result.question as ExamQuestion;
  },
  diagnostic: (event) => recordDiagnostic("app", "Exam recovery", event),
};
