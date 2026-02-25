// lib/ai/openrouter.ts
import { withTimeout } from "@/lib/ai/timeout";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callOpenRouterChat(opts: {
  apiKey: string;
  modelId: string;
  messages: ChatMessage[];
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}) {
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "ai-multimodel";
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AI_NOTE_LLM_TIMEOUT_MS || 60000);

  const { controller, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model: opts.modelId,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? Number(process.env.AI_NOTE_LLM_MAX_TOKENS || 900),
        temperature: opts.temperature ?? 0.6,
      }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      const head = text.slice(0, 1200);
      const err: any = new Error(`OPENROUTER_HTTP_${res.status}: ${head || "(empty body)"}`);
      err.httpStatus = res.status;

      if (res.status === 402) err.code = "OR_CREDIT_DEPLETED";
      else if (res.status === 429) err.code = "UPSTREAM_RATE_LIMIT";
      else if (res.status === 503) err.code = "UPSTREAM_OVERLOADED";
      else if (res.status === 400) err.code = "MODEL_NOT_SUPPORTED";
      else if (res.status === 502) err.code = "OPENROUTER_NO_RESPONSE";
      else err.code = `OPENROUTER_HTTP_${res.status}`;

      err.extra = { modelId: opts.modelId, status: res.status, head };
      throw err;
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err: any = new Error("OPENROUTER_BAD_JSON");
      err.httpStatus = 502;
      err.code = "OPENROUTER_BAD_JSON";
      err.extra = { modelId: opts.modelId, head: text.slice(0, 1200) };
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content;
    const actualModel = data?.model || opts.modelId;

    if (!content) {
      const err: any = new Error("OPENROUTER_NO_RESPONSE");
      err.httpStatus = 502;
      err.code = "OPENROUTER_NO_RESPONSE";
      err.extra = { modelId: opts.modelId, data };
      throw err;
    }

    return { content: String(content), modelUsed: String(actualModel) };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("OPENROUTER_TIMEOUT");
      err.httpStatus = 504;
      err.code = "OPENROUTER_TIMEOUT";
      err.extra = { modelId: opts.modelId, timeoutMs };
      throw err;
    }
    throw e;
  } finally {
    cancel();
  }
}

export function shouldFallback(e: any) {
  const httpStatus = Number(e?.httpStatus || 0);
  const code = String(e?.code || "");
  if (httpStatus === 402 || httpStatus === 429 || httpStatus === 503) return true;
  if (httpStatus === 400 && code === "MODEL_NOT_SUPPORTED") return true;
  if (code === "MODEL_NOT_SUPPORTED" || code === "UPSTREAM_RATE_LIMIT" || code === "UPSTREAM_OVERLOADED") return true;
  if (code === "OPENROUTER_NO_RESPONSE" || code === "OPENROUTER_TIMEOUT") return true;
  return false;
}