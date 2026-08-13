declare const Netlify: { env: { get(name: string): string | undefined } };

type SlideInput = { page: number; heading: string; text: string };

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { slide, surrounding = [] } = await request.json() as { slide: SlideInput; surrounding?: SlideInput[] };
  if (!slide?.page) return Response.json({ error: "No slide supplied" }, { status: 400 });
  const source = [slide, ...surrounding].map((item) => `[Page ${item.page}] ${item.text}`).join("\n").slice(0, 30_000);
  const prompt = `Using only the supplied lecture material, explain PDF page ${slide.page} for a medical student. Return JSON with summary (one plain-language paragraph, maximum 90 words), keyPoints (3-5 concise complete-sentence strings), whyItMatters (one short paragraph), terms (array of {term, definition}), and checkYourself (one question). Do not use Markdown, headings, bullets inside strings, or repeated page citations. Do not invent facts not supported by the context.\n\n${source}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", input: prompt, reasoning: { effort: "low" }, text: { format: { type: "json_object" } }, max_output_tokens: 1800 }),
  });
  if (!response.ok) return Response.json({ error: "Luna could not explain this slide.", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "{}";
  try { return Response.json(JSON.parse(output)); } catch { return Response.json({ error: "Luna returned an unreadable explanation." }, { status: 502 }); }
};
