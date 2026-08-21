declare const Netlify: { env: { get(name: string): string | undefined } };

type ChatMessage = { role: "user" | "assistant"; text: string };
type QuestionInput = {
  prompt: string;
  topic?: string;
  options: string[];
  answer: string;
  explanation: string;
};

const responseFormat = {
  type: "json_schema",
  name: "question_chat_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      message: { type: "string" },
      hasProposal: { type: "boolean" },
      proposal: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          topic: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["prompt", "topic", "options", "answer", "explanation"],
        additionalProperties: false,
      },
    },
    required: ["message", "hasProposal", "proposal"],
    additionalProperties: false,
  },
};

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  const body = await request.json() as { message?: string; question?: QuestionInput; history?: ChatMessage[]; libraryContext?: string };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 3000) : "";
  const question = body.question;
  if (!message || !question?.prompt || !Array.isArray(question.options) || !question.answer) {
    return Response.json({ error: "A question and message are required." }, { status: 400 });
  }
  const history = Array.isArray(body.history)
    ? body.history.slice(-8).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string").map((item) => `${item.role.toUpperCase()}: ${item.text.slice(0, 2000)}`).join("\n")
    : "";
  const libraryContext = typeof body.libraryContext === "string" ? body.libraryContext.slice(0, 65_000) : "No library excerpts were supplied.";
  const prompt = `You are Luna, a concise medical-school study partner discussing one saved multiple-choice question. You also have retrieved access to the student's private curriculum library. Use those excerpts to answer cross-lecture questions and verify whether a lecturer or course mentions a concept elsewhere. When reporting a library match, name the lecture and PDF page or SLO. Never claim the library lacks something unless the retrieved evidence supports that conclusion; say when retrieval is inconclusive.

Answer the student's question directly and accurately. You may use general medical knowledge. If the student asks you to revise, correct, clarify, improve, or otherwise edit the saved question, return a complete proposed replacement. Never say the edit has already been saved; explain that it is ready for the student to review.

For an edit proposal:
- Set hasProposal to true.
- Preserve the educational intent unless the student requests a different focus.
- Return between four and six distinct, plausible options. Preserve the current number of choices unless the student requests otherwise.
- Make answer exactly match one option.
- Keep the explanation concise and educational.
- Set topic to exactly one medically meaningful word with no spaces.

For ordinary discussion:
- Set hasProposal to false.
- Put empty strings, an empty topic, and an empty options array in proposal.
- Do not propose an edit unless the student actually requests one.

CURRENT SAVED QUESTION:
Question: ${String(question.prompt).slice(0, 5000)}
Topic: ${String(question.topic ?? "Unassigned").slice(0, 80)}
Options: ${JSON.stringify(question.options.slice(0, 6))}
Correct answer: ${String(question.answer).slice(0, 2000)}
Explanation: ${String(question.explanation ?? "").slice(0, 5000)}

RECENT CONVERSATION:
${history || "No earlier messages."}

RETRIEVED CURRICULUM LIBRARY:
${libraryContext}

STUDENT:
${message}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      input: prompt,
      reasoning: { effort: "low" },
      text: { format: responseFormat },
      max_output_tokens: 3000,
    }),
  });
  if (!response.ok) return Response.json({ error: "Luna could not answer this question.", detail: await response.text() }, { status: 502 });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "{}";
  try {
    return Response.json(JSON.parse(output));
  } catch {
    return Response.json({ error: "Luna returned an unreadable response." }, { status: 502 });
  }
};

export const config = { path: "/.netlify/functions/question-chat" };
