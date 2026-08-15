declare const Netlify: { env: { get(name: string): string | undefined } };

type SlideInput = { page: number; heading?: string; text: string };
type SourceInput = { lectureId: string; title: string; slos?: string[]; slides: SlideInput[] };

const questionFormat = {
  type: "json_schema",
  name: "question_drafts",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceLectureId: { type: "string" },
            type: { type: "string", enum: ["multiple-choice"] },
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "string" },
            explanation: { type: "string" },
            sourcePages: { type: "array", items: { type: "integer" } },
          },
          required: ["sourceLectureId", "type", "prompt", "options", "answer", "explanation", "sourcePages"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  },
};

function balanceAnswerPositions(questions: unknown[], limit: number) {
  const selected = questions.slice(0, limit);
  const seedText = selected.map((question) => question && typeof question === "object" && "prompt" in question ? String(question.prompt) : "").join("|");
  let seed = 0;
  for (let index = 0; index < seedText.length; index += 1) seed = ((seed * 31) + seedText.charCodeAt(index)) >>> 0;
  return selected.map((question, questionIndex) => {
    if (!question || typeof question !== "object" || !("type" in question) || question.type !== "multiple-choice" || !("options" in question) || !Array.isArray(question.options) || !("answer" in question)) return question;
    const options = question.options.filter((option): option is string => typeof option === "string");
    const answer = String(question.answer).trim();
    const correctIndex = options.findIndex((option) => option.trim() === answer);
    if (options.length < 2 || correctIndex < 0) return question;
    const [correctOption] = options.splice(correctIndex, 1);
    const targetIndex = (seed + questionIndex) % (options.length + 1);
    options.splice(targetIndex, 0, correctOption);
    return { ...question, options };
  });
}

function sourceText(sources: SourceInput[]) {
  let remaining = 90_000;
  return sources.map((source) => {
    if (remaining <= 0) return "";
    const block = `LECTURE ID: ${source.lectureId}\nLECTURE: ${source.title}\nSLOs: ${JSON.stringify(source.slos ?? [])}\n${source.slides.map((slide) => `[Page ${slide.page}] ${slide.heading ?? ""}\n${slide.text}`).join("\n")}`;
    const accepted = block.slice(0, remaining);
    remaining -= accepted.length;
    return accepted;
  }).filter(Boolean).join("\n\n---\n\n");
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { sources, count = 6, instruction = "" } = await request.json() as { sources: SourceInput[]; count?: number; instruction?: string };
  const validSources = Array.isArray(sources) ? sources.filter((source) => source?.lectureId && Array.isArray(source.slides) && source.slides.length) : [];
  if (!validSources.length) return Response.json({ error: "Select at least one lecture or slide with extracted text." }, { status: 400 });
  const requestedCount = Math.min(100, Math.max(1, Math.floor(Number(count) || 6)));
  const material = sourceText(validSources);
  const batchSizes: number[] = [];
  for (let remaining = requestedCount; remaining > 0; remaining -= 20) batchSizes.push(Math.min(20, remaining));

  const requestBatch = async (batchCount: number, batchIndex: number) => {
    const prompt = `Draft ${batchCount} high-quality study questions for a medical student using only the supplied lecture material. This is batch ${batchIndex + 1} of ${batchSizes.length}; make this batch varied and distinct, with broad coverage of the supplied material. Every question must be answerable from its cited source pages. Cover the central mechanisms, distinctions, definitions, and applications rather than isolated trivia. Distribute questions across the selected lectures when more than one lecture is supplied.

For every question:
- Copy sourceLectureId exactly from one supplied LECTURE ID; never combine lectures into one question.
- Cite the relevant page number or page numbers in sourcePages.
- Every question must be multiple-choice.
- Provide exactly four plausible options and make answer exactly match the correct option text.
- Keep the explanation concise and grounded in the cited material.
- Do not mention that you are an AI, the prompt, or the source excerpt.

Optional user direction:
${String(instruction).trim().slice(0, 2000) || "No additional direction."}

SELECTED LECTURE MATERIAL:
${material}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: prompt,
        reasoning: { effort: "low" },
        text: { format: questionFormat },
        max_output_tokens: 7000,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "{}";
    const parsed = JSON.parse(output) as { questions?: unknown[] };
    return Array.isArray(parsed.questions) ? parsed.questions.slice(0, batchCount) : [];
  };

  const results = await Promise.allSettled(batchSizes.map((batchCount, batchIndex) => requestBatch(batchCount, batchIndex)));
  const questions = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!questions.length) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    return Response.json({ error: "Luna could not draft questions.", detail: failure ? String(failure.reason) : "No question batches completed." }, { status: 502 });
  }
  const balanced = balanceAnswerPositions(questions, requestedCount);
  const warning = balanced.length < requestedCount ? `Luna drafted ${balanced.length} of the requested ${requestedCount} questions. You can review these now or return to the source selection and draft more.` : undefined;
  return Response.json({ questions: balanced, warning });
};

export const config = { path: "/.netlify/functions/generate-questions" };
