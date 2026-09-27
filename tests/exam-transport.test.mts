import { test } from "node:test";
import assert from "node:assert/strict";
import { createExamRequest } from "../lib/exam-transport.ts";
import { QuizGenerationError } from "../lib/adaptive-quiz.ts";

const signal = () => new AbortController().signal;
const never = <T>() => new Promise<T>(() => undefined);
const hasCode = (code: string) => (error: unknown) => error instanceof QuizGenerationError && error.code === code;

test("authentication locks time out before any request is sent", async () => {
  let requests = 0;
  const events: Record<string, unknown>[] = [];
  const request = createExamRequest({ getAccessToken: () => never(), authTimeoutMs: 10,
    fetch: async () => { requests++; return Response.json({}); }, diagnostic: event => events.push(event) });
  await assert.rejects(request({ action: "map-topics" }, signal()), hasCode("AUTHENTICATION"));
  assert.equal(requests, 0);
  assert.equal(events.at(-1)?.stage, "authentication");
  assert.equal(events.at(-1)?.event, "request-failed");
});

test("exit during authentication prevents a late token from dispatching requests", async () => {
  let release!: (token: string) => void;
  const token = new Promise<string>(resolve => { release = resolve; });
  let requests = 0;
  const request = createExamRequest({ getAccessToken: () => token,
    fetch: async () => { requests++; return Response.json({}); } });
  const controller = new AbortController();
  const pending = request({ action: "question" }, controller.signal);
  controller.abort();
  await assert.rejects(pending, /Cancelled/);
  release("private-token");
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requests, 0);
});

test("request and response-body deadlines settle even when fetch ignores cancellation", async () => {
  for (const fetcher of [async () => never<Response>(), async () => new Response(new ReadableStream({ start() {} }))]) {
    const request = createExamRequest({ getAccessToken: async () => "private-token", fetch: fetcher, requestTimeoutMs: 10 });
    await assert.rejects(request({ action: "question" }, signal()), hasCode("TIMEOUT"));
  }
});

test("HTML fallback is a deployment error, not endless generation retries", async () => {
  const request = createExamRequest({ getAccessToken: async () => "private-token",
    fetch: async () => new Response("<html>App shell</html>", { headers: { "Content-Type": "text/html" } }) });
  await assert.rejects(request({ action: "question" }, signal()), hasCode("CONFIGURATION"));
});

test("request diagnostics correlate safe provider errors without including source or credentials", async () => {
  const events: Record<string, unknown>[] = [];
  const request = createExamRequest({ getAccessToken: async () => "PRIVATE_TOKEN",
    fetch: async () => Response.json({ code: "PROVIDER_CONFIGURATION", error: "Unavailable", requestId: crypto.randomUUID(), diagnostic: { providerCode: "invalid_json_schema" } }, { status: 503 }),
    diagnostic: event => events.push(event) });
  await assert.rejects(request({ action: "map-topics", unit: { text: "PRIVATE_SOURCE" } }, signal()), hasCode("PROVIDER_CONFIGURATION"));
  assert.ok(events.some(event => event.providerCode === "invalid_json_schema"));
  assert.equal(new Set(events.map(event => event.localRequestId)).size, 1);
  assert.ok(!JSON.stringify(events).includes("PRIVATE_"));
});
