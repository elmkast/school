declare const Netlify: { env: { get(name: string): string | undefined } };

type SlideInput = { page: number; heading?: string; text: string };
type LectureInput = { title: string; slides: SlideInput[]; slos?: string[] };

function sourceFor(slides: SlideInput[]) {
  return slides.map((slide) => `[Page ${slide.page}] ${slide.text}`).join("\n").slice(0, 60_000);
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { lecture, instruction = "" } = await request.json() as { lecture: LectureInput; instruction?: string };
  if (!lecture?.slides?.length) return Response.json({ error: "No extracted slide text is available for this lecture." }, { status: 400 });

  const objectivePattern = /(?:session\s+)?learning objectives?|\bSLOs?\b|learning goals?/i;
  const likelyObjectiveSlides = lecture.slides.filter((slide) => objectivePattern.test(`${slide.heading ?? ""} ${slide.text ?? ""}`));
  const source = sourceFor((likelyObjectiveSlides.length ? likelyObjectiveSlides : lecture.slides).slice(0, 12));
  const prompt = `You repair Session Learning Objective extraction from medical-school lecture slides. Use only the supplied slide text. Return every explicitly stated learning objective as one separate string in the slos array. Split a merged paragraph when it contains multiple independently stated objectives, but keep multiple sentences together when they belong to the same objective. Preserve the source wording as closely as possible, lightly normalizing spacing and list markers. Do not invent, summarize, combine, or omit objectives. Exclude headings and administrative text.

Current extraction:
${JSON.stringify(lecture.slos ?? [])}

Optional user note:
${String(instruction).trim().slice(0, 2000) || "No additional note."}

Extracted objective-slide text:
${source}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      input: prompt,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "slo_reparse",
          strict: true,
          schema: {
            type: "object",
            properties: { slos: { type: "array", items: { type: "string" } } },
            required: ["slos"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 2400,
    }),
  });
  if (!response.ok) return Response.json({ error: "Luna could not re-parse these SLOs.", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "{}";
  try { return Response.json(JSON.parse(output)); } catch { return Response.json({ error: "Luna returned an unreadable SLO list." }, { status: 502 }); }
};
