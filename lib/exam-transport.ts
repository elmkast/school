import { QuizGenerationError } from "./adaptive-quiz.ts";
import { quizServiceFailure } from "./quiz-errors.ts";

type TransportDependencies = {
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
  diagnostic?(event: Record<string, unknown>): void;
  authTimeoutMs?: number;
  requestTimeoutMs?: number;
};

/** Bounds even dependencies which ignore AbortSignal (including an auth lock). */
export function withExamDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, milliseconds: number, timeoutError: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    if (parent.aborted) { controller.abort(); reject(new Error("Cancelled")); return; }
    const timer = setTimeout(() => { controller.abort(); finish(() => reject(timeoutError())); }, milliseconds);
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parent.removeEventListener("abort", cancel);
      action();
    };
    const cancel = () => { controller.abort(); finish(() => reject(new Error("Cancelled"))); };
    parent.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error("Cancelled");
      return operation(controller.signal);
    }).then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

export function createExamRequest(d: TransportDependencies) {
  return async (body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> => {
    const started = Date.now();
    const localRequestId = crypto.randomUUID();
    const action = body.action === "map-topics" ? "topic-mapping" : "question";
    let stage = "authentication";
    const report = (event: string, detail: Record<string, unknown> = {}) => {
      try { d.diagnostic?.({ event, version: "exam-v2", localRequestId, action, stage, elapsedMs: Date.now() - started, ...detail }); } catch { /* Never interrupt study. */ }
    };
    try {
      const encoded = JSON.stringify(body);
      if (new TextEncoder().encode(encoded).length > 180_000) throw new QuizGenerationError("This lecture section is too large to request.", false, { code: "BAD_REQUEST" });
      report("request-started");
      const token = await withExamDeadline(() => d.getAccessToken(), signal, d.authTimeoutMs ?? 10_000,
        () => new QuizGenerationError("Sign-in verification stalled. Exit Exam Prep, reload the page, and sign in again if needed.", false, { code: "AUTHENTICATION" }));
      if (!token) throw new QuizGenerationError("Exit Exam Prep and sign in again.", false, { code: "AUTHENTICATION" });
      if (signal.aborted) throw new Error("Cancelled");
      stage = "request";
      report("request-sent");
      const result = await withExamDeadline(async (requestSignal) => {
        let response: Response;
        try {
          response = await d.fetch("/.netlify/functions/exam", {
            method: "POST", signal: requestSignal,
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: encoded,
          });
        } catch {
          throw new QuizGenerationError("Waiting for Luna to reconnect.", false, { code: "TRANSIENT", retryable: true });
        }
        stage = "response-body";
        if (response.ok && response.headers.get("Content-Type")?.includes("text/html")) {
          throw new QuizGenerationError("The Exam Prep service is missing from this deployment. Reload after Netlify finishes deploying.", false, { code: "CONFIGURATION" });
        }
        let result: Record<string, unknown>;
        try {
          const value = await response.json();
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response.");
          result = value;
        } catch { throw quizServiceFailure(response.status, null, response.headers.get("Retry-After")); }
        const requestId = typeof result.requestId === "string" && /^[a-f0-9-]{36}$/i.test(result.requestId) ? result.requestId : "unavailable";
        const diagnostic = result.diagnostic && typeof result.diagnostic === "object" ? result.diagnostic as Record<string, unknown> : {};
        const providerCode = ["invalid_json_schema", "model_not_found", "invalid_api_key", "unsupported_parameter", "unsupported_value", "request_rejected"].includes(String(diagnostic.providerCode)) ? diagnostic.providerCode : undefined;
        report("response-received", { status: response.status, requestId, providerCode });
        if (!response.ok) throw quizServiceFailure(response.status, result, response.headers.get("Retry-After"));
        return result;
      }, signal, d.requestTimeoutMs ?? 55_000,
      () => new QuizGenerationError("Luna took too long to respond. Retrying automatically.", false, { code: "TIMEOUT", retryable: true }));
      if (signal.aborted) throw new Error("Cancelled");
      report("request-complete");
      return result;
    } catch (error) {
      const failure = error instanceof QuizGenerationError ? error : null;
      report(signal.aborted ? "request-cancelled" : "request-failed", { code: failure?.code ?? "CLIENT_ERROR", issues: failure?.issues ?? [] });
      throw error;
    }
  };
}
