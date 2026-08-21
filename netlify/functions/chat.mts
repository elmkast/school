declare const Netlify: { env: { get(name: string): string | undefined } };

type SlideInput = { page: number; heading: string; text: string };
type HistoryInput = { role: "user" | "assistant"; text: string };

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  const { question, slide, surrounding = [], history = [], libraryContext = "" } = await request.json() as { question?: string; slide?: SlideInput; surrounding?: SlideInput[]; history?: HistoryInput[]; libraryContext?: string };
  if (!question?.trim() || !slide?.page) return Response.json({ error: "A question and slide are required" }, { status: 400 });
  const source = [slide, ...surrounding].map((item) => `[PDF page ${item.page}] ${item.heading}\n${item.text}`).join("\n\n").slice(0, 30_000);
  const conversation = history.slice(-6).map((message) => `${message.role === "assistant" ? "Luna" : "Student"}: ${String(message.text).slice(0, 2000)}`).join("\n");
  const prompt = `You are Luna, a concise medical-school study tutor inside a lecture PDF viewer. Answer the student's actual question directly from your medical knowledge. You also have retrieved access to the student's private curriculum library; use it when the student asks where else a topic appears, and identify matching lecture titles and PDF pages or SLOs. Do not begin by referring to the current slide unless the student explicitly asks about it or that reference is essential. Treat the current page and nearby pages as optional background. Do not label information as outside or supplemental context. If the question is ambiguous, use the lecture and library context to infer the intended topic. Prefer clear prose and short lists. Do not provide patient-specific medical advice. Return JSON with one string field named answer.

Recent conversation:
${conversation || "No earlier messages."}

Student question:
${question.trim().slice(0, 2000)}

Lecture context:
${source}

Retrieved curriculum library:
${String(libraryContext).slice(0, 65_000) || "No matching excerpts were supplied."}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", input: prompt, reasoning: { effort: "low" }, text: { format: { type: "json_object" } }, max_output_tokens: 1600 }),
  });
  if (!response.ok) return Response.json({ error: "Luna could not answer this question.", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "{}";
  try {
    const parsed = JSON.parse(output) as { answer?: unknown };
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) throw new Error("Missing answer");
    return Response.json({ answer: parsed.answer.trim() });
  } catch { return Response.json({ error: "Luna returned an unreadable answer." }, { status: 502 }); }
};

export const config = { path: "/.netlify/functions/chat" };
