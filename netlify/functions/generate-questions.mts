declare const Netlify: { env: { get(name: string): string | undefined } };

type QuestionSourceKind = "lecture" | "slide" | "slo" | "preread";
type SlideInput = { page: number; heading?: string; text: string };
type SourceInput = {
  sourceKind: QuestionSourceKind;
  sourceId: string;
  title: string;
  lectureId?: string;
  preReadId?: string;
  sloIndexes?: number[];
  slos?: string[];
  slides: SlideInput[];
};

const questionFormat = {
  type: "json_schema", name: "question_drafts", strict: true,
  schema: {
    type: "object",
    properties: { questions: { type: "array", items: {
      type: "object",
      properties: {
        sourceKind: { type: "string", enum: ["lecture", "slide", "slo", "preread"] },
        sourceId: { type: "string" },
        sourceSloIndexes: { type: "array", items: { type: "integer" } },
        type: { type: "string", enum: ["multiple-choice"] },
        prompt: { type: "string" }, topic: { type: "string" }, options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 6 },
        answer: { type: "string" }, explanation: { type: "string" },
        sourcePages: { type: "array", items: { type: "integer" } },
      },
      required: ["sourceKind", "sourceId", "sourceSloIndexes", "type", "prompt", "topic", "options", "answer", "explanation", "sourcePages"],
      additionalProperties: false,
    } } },
    required: ["questions"], additionalProperties: false,
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
    options.splice((seed + questionIndex) % (options.length + 1), 0, correctOption);
    return { ...question, options };
  });
}

function sourceText(sources: SourceInput[]) {
  let remaining = 90_000;
  return sources.map((source) => {
    if (remaining <= 0) return "";
    const content = source.sourceKind === "slo"
      ? (source.slos ?? []).map((slo, index) => `[SLO ${source.sloIndexes?.[index] ?? index}] ${slo}`).join("\n")
      : source.slides.map((slide) => `[Page ${slide.page}] ${slide.heading ?? ""}\n${slide.text}`).join("\n");
    const accepted = `SOURCE KIND: ${source.sourceKind}\nSOURCE ID: ${source.sourceId}\nTITLE: ${source.title}\n${content}`.slice(0, remaining);
    remaining -= accepted.length;
    return accepted;
  }).filter(Boolean).join("\n\n---\n\n");
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { sources, count = 6, instruction = "" } = await request.json() as { sources: SourceInput[]; count?: number; instruction?: string };
  const validSources = Array.isArray(sources) ? sources.filter((source) => {
    if (!source?.sourceId || !["lecture", "slide", "slo", "preread"].includes(source.sourceKind)) return false;
    return source.sourceKind === "slo" ? Array.isArray(source.slos) && source.slos.length > 0 : Array.isArray(source.slides) && source.slides.length > 0;
  }) : [];
  if (!validSources.length) return Response.json({ error: "Select at least one source with usable content." }, { status: 400 });
  const requestedCount = Math.min(100, Math.max(1, Math.floor(Number(count) || 6)));
  const material = sourceText(validSources);
  const sourceMode = validSources[0].sourceKind === "slo" ? "slo" : validSources[0].sourceKind === "preread" ? "preread" : "lecture";
  const batchSizes: number[] = [];
  for (let remaining = requestedCount; remaining > 0; remaining -= 20) batchSizes.push(Math.min(20, remaining));

  const requestBatch = async (batchCount: number, batchIndex: number) => {
    const grounding = sourceMode === "slo"
      ? "The selected SLOs define the tested learning targets. You may use accurate external medical knowledge to create original, clinically useful NBME-style questions that assess those targets; do not merely restate an SLO. Every question must copy the relevant SLO source ID and list its zero-based SLO index in sourceSloIndexes. sourcePages must be empty."
      : sourceMode === "preread"
        ? "Use only the supplied pre-read content. Every question must be answerable from its cited pre-read page or excerpt. Copy the pre-read source ID, leave sourceSloIndexes empty, and cite relevant pages in sourcePages."
        : "Use only the supplied lecture material. Every question must be answerable from its cited page. Copy the lecture/slide source ID, leave sourceSloIndexes empty, and cite relevant pages in sourcePages.";
    const expandedChoiceCount = Math.max(0, Math.round(batchCount * 0.2));
    const prompt = `Draft ${batchCount} high-quality multiple-choice study questions for a medical student. This is batch ${batchIndex + 1} of ${batchSizes.length}; make it varied and distinct, with broad coverage of the selected sources. ${grounding}

For every question:
- Copy sourceKind and sourceId exactly from one supplied source; never combine source IDs in one question.
- Provide four plausible options for most questions. For exactly ${expandedChoiceCount} question${expandedChoiceCount === 1 ? "" : "s"} in this batch, provide five or six options when the content genuinely benefits from a broader differential. Make answer exactly match the correct option text.
- Set topic to exactly one medically meaningful word describing the main tested concept. No spaces, punctuation, or multi-word phrases.
- Cover central mechanisms, distinctions, definitions, and applications rather than isolated trivia.
- Use a clinical vignette when it improves the assessment, especially for SLO-based drafting.
- Keep the explanation concise and educational.
- Do not mention the prompt, source excerpt, or that you are an AI.

Optional user direction:
${String(instruction).trim().slice(0, 2000) || "No additional direction."}

SELECTED SOURCE MATERIAL:
${material}`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", input: prompt, reasoning: { effort: "low" }, text: { format: questionFormat }, max_output_tokens: 7000 }),
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
