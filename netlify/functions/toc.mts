declare const Netlify: { env: { get(name: string): string | undefined } };

type TocInput = { title:string; pages:number; slides:Array<{ page:number; heading?:string; text:string }> };

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status:405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error:"OPENAI_API_KEY is not configured" }, { status:503 });
  const { lecture } = await request.json() as { lecture:TocInput };
  if (!lecture?.slides?.length) return Response.json({ error:"No slide text supplied" }, { status:400 });
  const source = lecture.slides.map((slide) => `[PDF page ${slide.page}] ${slide.heading ? `${slide.heading}: ` : ""}${slide.text}`).join("\n").slice(0, 90_000);
  const prompt = `Build a navigable table of contents for the medical-school lecture “${lecture.title}”. Use only the supplied extracted slide text. Return JSON with one field, items, containing one title and page record for every substantive teaching slide. Each page must be the exact PDF page from the source. Preserve obvious standardized slide titles. When a title is unclear, write a short informative title grounded in that slide's text. Omit only blank, title, administrative, and truly redundant slides. Keep teaching order and never invent content.\n\n${source}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({ model:"gpt-5.6-luna", input:prompt, reasoning:{ effort:"low" }, text:{ format:{ type:"json_object" } }, max_output_tokens:5000 }),
  });
  if (!response.ok) return Response.json({ error:"AI processing failed", detail:await response.text() }, { status:502 });
  const data = await response.json() as { output_text?:string; output?:Array<{ content?:Array<{ text?:string }> }> };
  const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("") ?? "{}";
  try { return Response.json(JSON.parse(output)); } catch { return Response.json({ error:"AI returned invalid JSON" }, { status:502 }); }
};

export const config = { path:"/.netlify/functions/toc" };
