// lib/ai/groq.ts
import { withTimeout } from "@/lib/ai/timeout";
import type { ChatMessage } from "@/lib/ai/openrouter";

/**
 * ✅ Fix for TS error:
 * Buffer<ArrayBufferLike> is not assignable to BlobPart
 *
 * Root cause:
 * - TS DOM typings for BlobPart expect ArrayBuffer (not ArrayBufferLike)
 * - Node Buffer.buffer is ArrayBufferLike (can be SharedArrayBuffer)
 *
 * Solution:
 * - Slice Buffer into a real ArrayBuffer region, then build Blob from it.
 */
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function bufferToBlob(buf: Buffer, mime = "application/octet-stream"): Blob {
  return new Blob([bufferToArrayBuffer(buf)], { type: mime });
}

export async function callGroqChat(opts: {
  apiKey: string;
  modelId: string;
  messages: ChatMessage[];
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}) {
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AI_NOTE_LLM_TIMEOUT_MS || 60000);
  const { controller, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
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
      const err: any = new Error(`GROQ_HTTP_${res.status}`);
      err.httpStatus = res.status;
      err.code = `GROQ_HTTP_${res.status}`;
      err.extra = { head: text.slice(0, 1200) };
      throw err;
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err: any = new Error("GROQ_BAD_JSON");
      err.httpStatus = 502;
      err.code = "GROQ_BAD_JSON";
      err.extra = { head: text.slice(0, 1200) };
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const err: any = new Error("GROQ_NO_RESPONSE");
      err.httpStatus = 502;
      err.code = "GROQ_NO_RESPONSE";
      err.extra = data;
      throw err;
    }

    return { content: String(content), modelUsed: String(opts.modelId) };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("GROQ_TIMEOUT");
      err.httpStatus = 504;
      err.code = "GROQ_TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    cancel();
  }
}

// ✅ Groq ASR（OpenAI-compatible audio/transcriptions）
export async function callGroqTranscribe(opts: {
  apiKey: string;
  audio: Buffer;
  mime: string;
  filename?: string;
  model?: string;
  timeoutMs?: number;
  language?: string; // optional
}) {
  const model = opts.model || process.env.AI_NOTE_ASR_MODEL || "whisper-large-v3";
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AI_NOTE_ASR_TIMEOUT_MS || 90000);

  const { controller, cancel } = withTimeout(timeoutMs);

  try {
    const fd = new FormData();

    const filename = opts.filename || "audio.webm";
    const mime = opts.mime || "audio/webm";

    // ✅ Use Blob to avoid TS Buffer->BlobPart incompatibility
    const blob = bufferToBlob(opts.audio, mime);

    // ✅ In Node/Next, FormData.append supports (name, Blob, filename)
    fd.append("file", blob, filename);
    fd.append("model", model);

    // optional language
    if (opts.language) fd.append("language", opts.language);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: fd as any,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const err: any = new Error(`GROQ_ASR_HTTP_${res.status}`);
      err.httpStatus = res.status;
      err.code = `GROQ_ASR_HTTP_${res.status}`;
      err.extra = { head: text.slice(0, 1200) };
      throw err;
    }

    // Some providers return JSON; some may return plain text
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const outText = text.trim();
      if (!outText) {
        const err: any = new Error("GROQ_ASR_NO_TEXT");
        err.httpStatus = 502;
        err.code = "GROQ_ASR_NO_TEXT";
        err.extra = { raw: text.slice(0, 1200) };
        throw err;
      }
      return { text: outText, modelUsed: model, raw: text };
    }

    const out = String(data?.text || "").trim();
    if (!out) {
      const err: any = new Error("GROQ_ASR_NO_TEXT");
      err.httpStatus = 502;
      err.code = "GROQ_ASR_NO_TEXT";
      err.extra = { data };
      throw err;
    }

    return { text: out, modelUsed: model, raw: data };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("GROQ_ASR_TIMEOUT");
      err.httpStatus = 504;
      err.code = "GROQ_ASR_TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    cancel();
  }
}