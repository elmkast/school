declare const Netlify: { env: { get(name: string): string | undefined } };

type LectureInput = { title: string; lecturer: string; pages: number; slides: { page: number; text: string }[]; slos: string[] };

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { lecture } = await request.json() as { lecture: LectureInput };
  if (!lecture?.slides?.length) return Response.json({ error: "No slide text supplied" }, { status: 400 });
  const source = lecture.slides.map((s) => `[Page ${s.page}] ${s.text}`).join("\n").slice(0, 90_000);
  const prompt = `You organize medical-school lecture material. Use only the supplied slide text. Never add outside medical facts. Return compact JSON with: title, lecturer, course, summary (2 sentences), outline (4-8 section headings in teaching order), toc (one table-of-contents record with title and exact PDF page for every substantive teaching slide), slos (all stated learning objectives, verbatim or lightly normalized), and slides (up to 24 high-value records with page, heading, text). For toc, preserve clear slide titles; when a title is unclear, write a concise label grounded in that slide's text. Omit only blank, title, administrative, and truly redundant slides. Retain teaching order and always use the correct PDF page. Do not infer a curriculum week; the student assigns that manually. Prioritize SLOs, section headings, comparison tables, definitions, mechanisms, diagnostic distinctions, and treatment content. Every slide record must retain the correct source page.\n\n${source}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", input: prompt, reasoning: { effort: "low" }, text: { format: { type: "json_object" } }, max_output_tokens: 6500 }),
  });
  if (!response.ok) return Response.json({ error: "AI processing failed", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "{}";
  try { return Response.json(JSON.parse(output)); } catch { return Response.json({ error: "AI returned invalid JSON" }, { status: 502 }); }
};

export const config = { path: "/.netlify/functions/analyze" };
