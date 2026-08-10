declare const Netlify: { env: { get(name: string): string | undefined } };

type LectureInput = { title: string; lecturer: string; date: string; pages: number; slides: { page: number; text: string }[]; slos: string[] };

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { lecture } = await request.json() as { lecture: LectureInput };
  if (!lecture?.slides?.length) return Response.json({ error: "No slide text supplied" }, { status: 400 });
  const source = lecture.slides.map((s) => `[Page ${s.page}] ${s.text}`).join("\n").slice(0, 140_000);
  const prompt = `You organize medical-school lecture material. Use only the supplied slide text. Never add outside medical facts. Return JSON with: title, lecturer, date, course, summary (2 sentences), slos (verbatim or lightly normalized), concepts (8-14 concise strings), and slides (8-20 high-value records with page, heading, text). Every slide record must retain the correct source page.\n\n${source}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5-mini", input: prompt, text: { format: { type: "json_object" } } }),
  });
  if (!response.ok) return Response.json({ error: "AI processing failed", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "{}";
  try { return Response.json(JSON.parse(output)); } catch { return Response.json({ error: "AI returned invalid JSON" }, { status: 502 }); }
};

export const config = { path: "/.netlify/functions/analyze" };
