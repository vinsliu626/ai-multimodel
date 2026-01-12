type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callGroqChat(
  groqKey: string,
  modelId: string,
  messages: ChatMessage[],
  opts?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: opts?.temperature ?? 0.2,
      max_tokens: opts?.max_tokens,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Groq failed: ${res.status}\n${text}`);

  const data = JSON.parse(text);
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq missing choices[0].message.content");
  return reply as string;
}
