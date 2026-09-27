import { supabase } from "./supabase-client.ts";
import { recordDiagnostic } from "./diagnostics.ts";
import { QuizGenerationError } from "./adaptive-quiz.ts";
import { createExamRequest } from "./exam-transport.ts";
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

const examRequest = createExamRequest({
  async getAccessToken() {
    if (!supabase) throw new QuizGenerationError("Exam Prep needs a signed-in account.", false, { code: "CONFIGURATION" });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new QuizGenerationError("Exit Exam Prep and sign in again.", false, { code: "AUTHENTICATION" });
    return data.session?.access_token ?? null;
  },
  fetch: (...args) => fetch(...args),
  diagnostic: (event) => recordDiagnostic("app", "Exam request", event),
});

function isExamEvidence(value: unknown): value is ExamEvidence {
  return Boolean(value && typeof value === "object" && typeof (value as ExamEvidence).id === "string" &&
    typeof (value as ExamEvidence).text === "string" && typeof (value as ExamEvidence).page === "number");
}

export const liveExamService: ExamService = {
  async mapTopics(unit, signal, retry) {
    const result = await examRequest({ action: "map-topics", unit, retry }, signal);
    if (!Array.isArray(result.topics)) throw new QuizGenerationError("Luna returned an invalid topic map.", true, { issues: ["TOPICS_INVALID"] });
    return result.topics.map((value) => {
      if (!value || typeof value !== "object") throw new QuizGenerationError("Invalid lecture topic.", true, { issues: ["TOPICS_INVALID"] });
      const item = value as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim() || !Array.isArray(item.evidenceIds) || !item.evidenceIds.length || !item.evidenceIds.every((id) => typeof id === "string")) throw new QuizGenerationError("Invalid lecture topic evidence.", true, { issues: ["TOPICS_INVALID"] });
      return { title: item.title.trim(), evidenceIds: item.evidenceIds as string[] };
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
