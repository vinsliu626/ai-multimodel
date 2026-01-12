type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

export type OpenAICompatClient = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export async function chatCompletionJSON<T>(client: OpenAICompatClient, messages: Msg[]) {
  const url = `${client.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${client.apiKey}`,
    },
    body: JSON.stringify({
      model: client.model,
      messages,
      temperature: 0.2,
      // 尽量引导 JSON 输出（不同厂商支持情况不同；不支持也没关系）
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `LLM error (${res.status})`;
    throw new Error(msg);
  }

  const content: string =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    "";

  if (!content.trim()) throw new Error("Empty LLM response");

  // 有些厂商会把 JSON 包在 ```json 里，这里做个兜底剥壳
  const cleaned = stripJsonFence(content);

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // 方便你 debug
    throw new Error(`Failed to parse JSON from model. Raw:\n${content}`);
  }
}

function stripJsonFence(s: string) {
  const t = s.trim();
  if (t.startsWith("```")) {
    // ```json ... ```
    return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}
