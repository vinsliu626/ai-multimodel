type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callHfRouterChat(
  hfToken: string,
  modelId: string,
  messages: ChatMessage[],
  opts?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hfToken}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: opts?.temperature ?? 0,
      max_tokens: opts?.max_tokens,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HF Router failed: ${res.status}\n${text}`);

  const data = JSON.parse(text);
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("HF Router missing choices[0].message.content");
  return reply as string;
}
