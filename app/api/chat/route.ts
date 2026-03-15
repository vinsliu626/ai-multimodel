// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";
import { assertChatRequestAllowed, ChatLimitError } from "@/lib/chat/quota";
import { normalizeAiText } from "@/lib/ui/aiTextFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Mode = "single" | "team" | "detector";
type ModelKind = "fast" | "quality";
type Stage = "planner" | "writer" | "reviewer" | "final";

const FAST_MODEL = "llama-3.1-8b-instant";
const QUALITY_MODEL = "llama-3.3-70b-versatile";

const OR_STABLE_FREE = [
  "liquid/lfm-2.5-1.2b-instruct:free",
  "google/gemma-3n-e4b-it:free",
  "google/gemma-3n-e2b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "openrouter/free",
];

const OR_PLANNER_CANDIDATES = OR_STABLE_FREE;
const OR_WRITER_CANDIDATES = OR_STABLE_FREE;
const OR_REVIEWER_CANDIDATES = OR_STABLE_FREE;
const OR_FINAL_CANDIDATES = OR_STABLE_FREE;

const STAGE_TIMEOUT_MS: Record<Stage, number> = {
  planner: 6000,
  writer: 9000,
  reviewer: 6000,
  final: 12000,
};

const STREAM_FIRST_TOKEN_TIMEOUT_MS = 8000;
const STREAM_IDLE_TIMEOUT_MS = 12000;
const STREAM_MAX_TOKENS = 1200;
const NON_STREAM_MAX_TOKENS = 900;

function jsonErr(status: number, code: string, message: string, extra?: unknown) {
  return NextResponse.json({ ok: false, error: code, message, ...(extra ? { extra } : {}) }, { status });
}

function mapUpstreamError(e: any): { status: number; error: string; message: string; extra?: any } {
  const code = String(e?.code || "");
  const httpStatus = Number(e?.httpStatus || 0);

  if (code === "OR_CREDIT_DEPLETED" || httpStatus === 402) {
    return { status: 402, error: "OR_CREDIT_DEPLETED", message: "OpenRouter credit depleted.", extra: e?.extra };
  }
  if (code === "UPSTREAM_RATE_LIMIT" || httpStatus === 429) {
    return { status: 429, error: "UPSTREAM_RATE_LIMIT", message: "Upstream rate limited. Please retry later.", extra: e?.extra };
  }
  if (code === "UPSTREAM_OVERLOADED" || httpStatus === 503 || httpStatus === 502) {
    return { status: 503, error: "UPSTREAM_OVERLOADED", message: "Upstream overloaded. Please retry later.", extra: e?.extra };
  }
  if (code === "ALL_WORKFLOW_MODELS_FAILED") {
    return { status: 503, error: "ALL_WORKFLOW_MODELS_FAILED", message: "All workflow models failed. Please try again later.", extra: e?.extra };
  }
  if (code === "MODEL_NOT_SUPPORTED" || httpStatus === 400) {
    return { status: 502, error: "MODEL_NOT_SUPPORTED", message: "Upstream model not supported.", extra: e?.extra };
  }
  if (code === "OPENROUTER_TIMEOUT" || code === "GROQ_TIMEOUT" || httpStatus === 504) {
    return { status: 504, error: "UPSTREAM_TIMEOUT", message: "Upstream timeout. Please retry later.", extra: e?.extra };
  }

  return {
    status: 500,
    error: "INTERNAL_ERROR",
    message: e?.message ?? "Unknown error",
    extra: e?.extra,
  };
}

function shouldFallback(e: any) {
  const httpStatus = Number(e?.httpStatus || 0);
  const code = String(e?.code || "");
  const msg = String(e?.message || "");

  if ([400, 402, 429, 502, 503, 504].includes(httpStatus)) return true;
  if (httpStatus === 400 && (code === "MODEL_NOT_SUPPORTED" || msg.includes("model_not_supported"))) return true;
  return [
    "MODEL_NOT_SUPPORTED",
    "UPSTREAM_RATE_LIMIT",
    "UPSTREAM_OVERLOADED",
    "OPENROUTER_NO_RESPONSE",
    "OPENROUTER_BAD_JSON",
    "OPENROUTER_TIMEOUT",
    "GROQ_NO_RESPONSE",
    "GROQ_BAD_JSON",
    "GROQ_TIMEOUT",
  ].includes(code);
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as Record<string, string>;
}

function sseEvent(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function wantsSSE(req: Request) {
  return (req.headers.get("accept") || "").includes("text/event-stream");
}

function getLastUserText(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (lastUser?.content || "").trim();
}

function trimHistory(messages: ChatMessage[], max = 20) {
  return messages.filter((m) => m.role !== "system").slice(-max);
}

function systemAssistant(isZh: boolean) {
  return isZh
    ? [
        "你是一个自然、直接、可靠的 AI 助手。",
        "像正常对话一样回答用户问题。",
        "除非用户明确要求，否则不要使用 workflow、review、revised draft、conclusion 这类结构。",
        "回答要清楚、实用，不要过度铺陈。",
      ].join("\n")
    : [
        "You are a natural, direct, reliable AI assistant.",
        "Answer the user's message like a normal conversation.",
        "Unless the user explicitly asks for it, do not use workflow, review, revised draft, or conclusion formatting.",
        "Be clear, practical, and concise.",
      ].join("\n");
}

function systemPlanner(isZh: boolean) {
  return isZh
    ? [
        "你是 Planner。",
        "任务：先给出一个简洁可执行的大纲，供后续写作和修订使用。",
        "",
        "输出格式：",
        "[Plan]",
        "Goal: 一句话说明目标",
        "Audience: 一句话说明对象或场景",
        "Sections:",
        "1. 标题 - 2到3个要点",
        "2. 标题 - 2到3个要点",
        "3. 标题 - 2到3个要点",
        "Missing info: 最多2条，没有就写 None",
        "",
        "要求：保持简洁，不要写正文，不要编造数据或引用。",
      ].join("\n")
    : [
        "You are Planner.",
        "Task: produce a concise, usable outline for the writing flow.",
        "",
        "Output format:",
        "[Plan]",
        "Goal: one sentence",
        "Audience: one sentence",
        "Sections:",
        "1. Heading - 2 to 3 key points",
        "2. Heading - 2 to 3 key points",
        "3. Heading - 2 to 3 key points",
        "Missing info: at most 2 items, or None",
        "",
        "Requirements: keep it concise, do not write the full draft, and do not invent citations or exact statistics.",
      ].join("\n");
}

function systemWriter(isZh: boolean) {
  return isZh
    ? [
        "你是 Writer。",
        "任务：根据 Plan 写出主草稿。",
        "",
        "输出格式：",
        "[Draft]",
        "- 按照 plan 的结构写。",
        "- 写成完整草稿，但保留可修订空间。",
        "- 如果信息缺失，最多加 2 条 [Assumption]。",
        "",
        "限制：不要输出审阅意见，不要输出最终结论，不要提到角色名。",
      ].join("\n")
    : [
        "You are Writer.",
        "Task: write the main draft following the plan.",
        "",
        "Output format:",
        "[Draft]",
        "- Follow the plan structure with clear headings and readable paragraphs.",
        "- Write a solid draft, but leave room for revision.",
        "- If something is missing, use at most 2 short [Assumption] notes.",
        "",
        "Constraints: do not output review notes, do not output the final answer yet, and do not mention role names.",
      ].join("\n");
}

function systemReviewer(isZh: boolean) {
  return isZh
    ? [
        "你是 Reviewer。",
        "任务：阅读 Plan 和 Draft，只返回简洁的修订说明，供内部改写使用。",
        "",
        "输出格式：",
        "[Revision Notes]",
        "- 只写 3 到 5 条简短建议。",
        "- 重点指出逻辑漏洞、缺少细节、重复、过渡生硬、论证不足或结构不清。",
        "- 每条都要可执行。",
        "",
        "限制：不要重写正文，不要输出最终答案，不要写长篇提示列表。",
      ].join("\n")
    : [
        "You are Reviewer.",
        "Task: read the plan and the draft, then return compact revision instructions for an internal rewrite pass.",
        "",
        "Output format:",
        "[Revision Notes]",
        "- Return 3 to 5 concise bullets only.",
        "- Focus on missing detail, weak logic, repetition, weak transitions, unsupported claims, or unclear sections.",
        "- Each bullet must tell the next writer what to improve.",
        "",
        "Constraints: do not rewrite the draft, do not produce the final answer, and do not generate bloated tip lists.",
      ].join("\n");
}

function systemFinalizer(isZh: boolean) {
  return isZh
    ? [
        "你是 Final Writer。",
        "任务：根据 Plan、Draft 和 Revision Notes 输出最终给用户看的版本。",
        "保留清楚的结构，做出真正有用的修订。",
        "Reviewer 的意见要落实到正文里，但不要把文章写得过于花哨。",
        "结尾加一个简短结论。",
        "不要输出角色名，不要输出审阅说明。",
      ].join("\n")
    : [
        "You are Final Writer.",
        "Task: use the plan, the draft, and the revision notes to produce the final user-facing answer.",
        "Keep the structure clear and apply real revisions to the draft.",
        "Use the reviewer guidance, but do not turn the result into stiff model-essay language.",
        "End with a short conclusion.",
        "Do not output role labels or review notes.",
      ].join("\n");
}

function systemWorkflowReviewer(isZh: boolean) {
  return isZh
    ? [
        "浣犳槸 Reviewer銆?",
        "浠诲姟锛氶槄璇?Plan 鍜?Draft锛岀洿鎺ユ妸鑽夌淇敼鎴愭洿濂界殑鏈€缁堢増鏈€?",
        "妫€鏌ラ仐婕忋€侀€昏緫銆侀噸澶嶃€佷笉娓呮櫚銆佹病鏈夋敮鎾戠殑璇存硶鍜岄渶瑕佹洿濂借繃娓＄殑鍦版柟锛屽苟鎶婃敼杩涚洿鎺ヤ綋鐜板湪姝ｆ枃閲屻€?",
        "鏈€鍚庡姞涓€涓畝鐭粨璁恒€?",
        "涓嶈杈撳嚭 Tip 鍒楄〃銆佷慨鏀硅鏄庛€佽瘎璇崱鐗囨垨瑙掕壊鏍囩銆?",
      ].join("\n")
    : [
        "You are Reviewer.",
        "Task: read the plan and the draft, then directly rewrite the draft into a stronger final version.",
        "Check for missing detail, weak logic, repetition, unclear claims, unsupported statements, and places that need better structure or transitions.",
        "Apply those improvements in the body itself.",
        "End with a short conclusion.",
        "Do not output tip lists, review notes, role labels, or reviewer commentary.",
      ].join("\n");
}

function buildStageMessages(baseHistory: ChatMessage[], system: string, userTask: string): ChatMessage[] {
  return [{ role: "system", content: system }, ...trimHistory(baseHistory, 20), { role: "user", content: userTask }];
}

async function ensureSessionId(opts: { userId: string; chatSessionId: string | null; userRequest: string }) {
  const { userId, chatSessionId, userRequest } = opts;

  if (chatSessionId) {
    const existing = await prisma.chatSession.findFirst({ where: { id: chatSessionId, userId }, select: { id: true } });
    if (existing) return chatSessionId;
  }

  const title = userRequest.slice(0, 40) || "New Chat";
  const created = await prisma.chatSession.create({ data: { userId, title }, select: { id: true } });
  return created.id;
}

async function saveChatMessage(chatSessionId: string, role: "user" | "assistant" | "system", content: string) {
  if (!content?.trim()) return;
  await prisma.chatMessage.create({ data: { chatSessionId, role, content }, select: { id: true } });
}

async function safeSave(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.error("save failed:", error);
  }
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

async function callGroqChat(apiKey: string, modelId: string, messages: ChatMessage[], timeoutMs: number) {
  const { controller, clear } = createTimeoutController(timeoutMs);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelId, messages, max_tokens: NON_STREAM_MAX_TOKENS }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const err: any = new Error(`GROQ_HTTP_${res.status}`);
      err.httpStatus = res.status;
      err.code = `GROQ_HTTP_${res.status}`;
      err.extra = { head: text.slice(0, 1200), modelId };
      throw err;
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err: any = new Error("GROQ_BAD_JSON");
      err.httpStatus = 502;
      err.code = "GROQ_BAD_JSON";
      err.extra = { head: text.slice(0, 1200), modelId };
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const err: any = new Error("GROQ_NO_RESPONSE");
      err.httpStatus = 502;
      err.code = "GROQ_NO_RESPONSE";
      err.extra = { data, modelId };
      throw err;
    }

    return { content: String(content), modelUsed: modelId };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const err: any = new Error("GROQ_TIMEOUT");
      err.httpStatus = 504;
      err.code = "GROQ_TIMEOUT";
      err.extra = { modelId, timeoutMs };
      throw err;
    }
    throw error;
  } finally {
    clear();
  }
}

async function callOpenRouterChat(apiKey: string, modelId: string, messages: ChatMessage[], timeoutMs: number) {
  const { controller, clear } = createTimeoutController(timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "ai-multimodel",
      },
      body: JSON.stringify({ model: modelId, messages, max_tokens: NON_STREAM_MAX_TOKENS }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const err: any = new Error(`OPENROUTER_HTTP_${res.status}: ${text.slice(0, 1200) || "(empty body)"}`);
      err.httpStatus = res.status;
      if (res.status === 402) err.code = "OR_CREDIT_DEPLETED";
      else if (res.status === 429) err.code = "UPSTREAM_RATE_LIMIT";
      else if (res.status === 503) err.code = "UPSTREAM_OVERLOADED";
      else if (res.status === 400) err.code = "MODEL_NOT_SUPPORTED";
      else if (res.status === 502) err.code = "OPENROUTER_NO_RESPONSE";
      else if (res.status === 504) err.code = "OPENROUTER_TIMEOUT";
      else err.code = `OPENROUTER_HTTP_${res.status}`;
      err.extra = { modelId, status: res.status, head: text.slice(0, 1200) };
      throw err;
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err: any = new Error("OPENROUTER_BAD_JSON");
      err.httpStatus = 502;
      err.code = "OPENROUTER_BAD_JSON";
      err.extra = { modelId, head: text.slice(0, 1200) };
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content;
    const actualModel = data?.model || modelId;
    if (!content) {
      const err: any = new Error("OPENROUTER_NO_RESPONSE");
      err.httpStatus = 502;
      err.code = "OPENROUTER_NO_RESPONSE";
      err.extra = { modelId, data };
      throw err;
    }

    return { content: String(content), modelUsed: String(actualModel) };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const err: any = new Error("OPENROUTER_TIMEOUT");
      err.httpStatus = 504;
      err.code = "OPENROUTER_TIMEOUT";
      err.extra = { modelId, timeoutMs };
      throw err;
    }
    throw error;
  } finally {
    clear();
  }
}

function parseOpenAiStreamChunk(chunk: string) {
  const deltas: string[] = [];
  let modelUsed: string | null = null;

  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const data = JSON.parse(payload);
      if (!modelUsed && data?.model) modelUsed = String(data.model);
      const delta = data?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) deltas.push(delta);
    } catch {}
  }

  return { deltaText: deltas.join(""), modelUsed };
}

async function streamOpenAiCompatibleResponse(opts: {
  res: Response;
  modelId: string;
  firstTokenTimeoutMs: number;
  idleTimeoutMs: number;
  onDelta: (delta: string) => void;
}) {
  const { res, modelId, firstTokenTimeoutMs, idleTimeoutMs, onDelta } = opts;
  const reader = res.body?.getReader();
  if (!reader) {
    const err: any = new Error("STREAM_NO_BODY");
    err.httpStatus = 502;
    err.code = modelId.includes("/") ? "OPENROUTER_NO_RESPONSE" : "GROQ_NO_RESPONSE";
    err.extra = { modelId };
    throw err;
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let content = "";
  let modelUsed: string | null = null;
  let gotAnyToken = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const refreshTimer = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        reader.cancel();
      } catch {}
    }, ms);
  };

  refreshTimer(firstTokenTimeoutMs);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const parsed = parseOpenAiStreamChunk(part);
        if (parsed.modelUsed && !modelUsed) modelUsed = parsed.modelUsed;
        if (parsed.deltaText) {
          gotAnyToken = true;
          content += parsed.deltaText;
          onDelta(parsed.deltaText);
          refreshTimer(idleTimeoutMs);
        }
      }
    }
  } catch (error) {
    if (!gotAnyToken) {
      const err: any = new Error("STREAM_TIMEOUT");
      err.httpStatus = 504;
      err.code = modelId.includes("/") ? "OPENROUTER_TIMEOUT" : "GROQ_TIMEOUT";
      err.extra = { modelId, firstTokenTimeoutMs, idleTimeoutMs };
      throw err;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!content.trim()) {
    const err: any = new Error("STREAM_EMPTY");
    err.httpStatus = 502;
    err.code = modelId.includes("/") ? "OPENROUTER_NO_RESPONSE" : "GROQ_NO_RESPONSE";
    err.extra = { modelId };
    throw err;
  }

  return { content, modelUsed: modelUsed || modelId };
}

async function callOpenRouterChatStream(apiKey: string, modelId: string, messages: ChatMessage[], onDelta: (delta: string) => void) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "ai-multimodel",
    },
    body: JSON.stringify({ model: modelId, messages, max_tokens: STREAM_MAX_TOKENS, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: any = new Error(`OPENROUTER_HTTP_${res.status}: ${text.slice(0, 1200) || "(empty body)"}`);
    err.httpStatus = res.status;
    if (res.status === 402) err.code = "OR_CREDIT_DEPLETED";
    else if (res.status === 429) err.code = "UPSTREAM_RATE_LIMIT";
    else if (res.status === 503) err.code = "UPSTREAM_OVERLOADED";
    else if (res.status === 400) err.code = "MODEL_NOT_SUPPORTED";
    else if (res.status === 502) err.code = "OPENROUTER_NO_RESPONSE";
    else if (res.status === 504) err.code = "OPENROUTER_TIMEOUT";
    else err.code = `OPENROUTER_HTTP_${res.status}`;
    err.extra = { modelId, status: res.status, head: text.slice(0, 1200) };
    throw err;
  }

  return streamOpenAiCompatibleResponse({
    res,
    modelId,
    firstTokenTimeoutMs: STREAM_FIRST_TOKEN_TIMEOUT_MS,
    idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    onDelta,
  });
}

async function callGroqChatStream(apiKey: string, modelId: string, messages: ChatMessage[], onDelta: (delta: string) => void) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages, max_tokens: STREAM_MAX_TOKENS, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: any = new Error(`GROQ_HTTP_${res.status}`);
    err.httpStatus = res.status;
    err.code = `GROQ_HTTP_${res.status}`;
    err.extra = { modelId, head: text.slice(0, 1200) };
    throw err;
  }

  return streamOpenAiCompatibleResponse({
    res,
    modelId,
    firstTokenTimeoutMs: STREAM_FIRST_TOKEN_TIMEOUT_MS,
    idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    onDelta,
  });
}

async function tryWithFallback(opts: {
  stage: Stage;
  messages: ChatMessage[];
  groqKey: string;
  groqModel: string;
  openrouterKey?: string;
  openrouterCandidates: string[];
}) {
  const { stage, messages, groqKey, groqModel, openrouterKey, openrouterCandidates } = opts;
  const timeoutMs = STAGE_TIMEOUT_MS[stage];

  if (openrouterKey) {
    for (const modelId of openrouterCandidates) {
      try {
        const out = await callOpenRouterChat(openrouterKey, modelId, messages, timeoutMs);
        return { stage, provider: "openrouter" as const, model: out.modelUsed, content: out.content };
      } catch (error: any) {
        console.warn(`[workflow:${stage}] OpenRouter failed fast`, {
          modelId,
          code: error?.code || error?.message,
          httpStatus: error?.httpStatus,
        });
        if (!shouldFallback(error)) throw error;
      }
    }
  }

  try {
    const groq = await callGroqChat(groqKey, groqModel, messages, Math.max(timeoutMs, 8000));
    return { stage, provider: "groq" as const, model: groq.modelUsed, content: groq.content };
  } catch (error: any) {
    if (openrouterKey && shouldFallback(error)) {
      const err: any = new Error("ALL_WORKFLOW_MODELS_FAILED");
      err.code = "ALL_WORKFLOW_MODELS_FAILED";
      err.httpStatus = 503;
      err.extra = { stage, lastCode: error?.code || error?.message };
      throw err;
    }
    throw error;
  }
}

async function tryGroqFirst(opts: {
  stage: Stage;
  messages: ChatMessage[];
  groqKey: string;
  groqModel: string;
  openrouterKey?: string;
  openrouterCandidates: string[];
}) {
  const { stage, messages, groqKey, groqModel, openrouterKey, openrouterCandidates } = opts;
  const timeoutMs = STAGE_TIMEOUT_MS[stage];

  try {
    const groq = await callGroqChat(groqKey, groqModel, messages, Math.max(timeoutMs, 8000));
    return { stage, provider: "groq" as const, model: groq.modelUsed, content: groq.content };
  } catch (error: any) {
    console.warn(`[chat:${stage}] Groq failed fast`, {
      code: error?.code || error?.message,
      httpStatus: error?.httpStatus,
    });
    if (!openrouterKey || !shouldFallback(error)) throw error;
  }

  for (const modelId of openrouterCandidates) {
    try {
      const out = await callOpenRouterChat(openrouterKey!, modelId, messages, timeoutMs);
      return { stage, provider: "openrouter" as const, model: out.modelUsed, content: out.content };
    } catch (error: any) {
      console.warn(`[chat:${stage}] OpenRouter fallback failed`, {
        modelId,
        code: error?.code || error?.message,
        httpStatus: error?.httpStatus,
      });
      if (!shouldFallback(error)) throw error;
    }
  }

  const err: any = new Error("ALL_CHAT_PROVIDERS_FAILED");
  err.code = "ALL_CHAT_PROVIDERS_FAILED";
  err.httpStatus = 502;
  throw err;
}

async function streamWithFallback(opts: {
  stage: Stage;
  messages: ChatMessage[];
  groqKey: string;
  groqModel: string;
  openrouterKey?: string;
  openrouterCandidates: string[];
  onDelta: (delta: string) => void;
}) {
  const { stage, messages, groqKey, groqModel, openrouterKey, openrouterCandidates, onDelta } = opts;

  if (openrouterKey) {
    for (const modelId of openrouterCandidates) {
      try {
        const out = await callOpenRouterChatStream(openrouterKey, modelId, messages, onDelta);
        return { stage, provider: "openrouter" as const, model: out.modelUsed, content: out.content };
      } catch (error: any) {
        console.warn(`[workflow:${stage}] OpenRouter stream failed fast`, {
          modelId,
          code: error?.code || error?.message,
          httpStatus: error?.httpStatus,
        });
        if (!shouldFallback(error)) throw error;
      }
    }
  }

  try {
    const groq = await callGroqChatStream(groqKey, groqModel, messages, onDelta);
    return { stage, provider: "groq" as const, model: groq.modelUsed, content: groq.content };
  } catch (error: any) {
    if (openrouterKey && shouldFallback(error)) {
      const err: any = new Error("ALL_WORKFLOW_MODELS_FAILED");
      err.code = "ALL_WORKFLOW_MODELS_FAILED";
      err.httpStatus = 503;
      err.extra = { stage, lastCode: error?.code || error?.message };
      throw err;
    }
    throw error;
  }
}

function extractSection(text: string, labels: string[]) {
  const trimmed = text.trim();
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}\\s*`, "i");
    if (regex.test(trimmed)) return trimmed.replace(regex, "").trim();
  }
  return trimmed;
}

async function buildTeamOutputs(opts: {
  messages: ChatMessage[];
  userRequest: string;
  isZh: boolean;
  groqKey: string;
  groqModel: string;
  openrouterKey?: string;
  onWriterDelta?: (delta: string, snapshot: string) => void;
  onReviewerDelta?: (delta: string, snapshot: string) => void;
}) {
  const { messages, userRequest, isZh, groqKey, groqModel, openrouterKey, onWriterDelta, onReviewerDelta } = opts;

  const plannerMsgs = buildStageMessages(
    messages,
    systemPlanner(isZh),
    isZh ? `用户需求：\n${userRequest}\n\n请先输出简洁 plan。` : `User request:\n${userRequest}\n\nOutput a concise plan first.`
  );
  const planner = await tryWithFallback({
    stage: "planner",
    messages: plannerMsgs,
    groqKey,
    groqModel,
    openrouterKey,
    openrouterCandidates: OR_PLANNER_CANDIDATES,
  });

  const writerMsgs = buildStageMessages(
    messages,
    systemWriter(isZh),
    isZh ? `下面是 plan：\n\n${planner.content}\n\n请按这个 plan 写出主草稿。` : `Here is the plan:\n\n${planner.content}\n\nWrite the main draft following it.`
  );
  let writerSnapshot = "";
  const writer = await streamWithFallback({
    stage: "writer",
    messages: writerMsgs,
    groqKey,
    groqModel,
    openrouterKey,
    openrouterCandidates: OR_WRITER_CANDIDATES,
    onDelta: (delta) => {
      writerSnapshot += delta;
      onWriterDelta?.(delta, writerSnapshot);
    },
  });

  const reviewerMsgs = buildStageMessages(
    messages,
    systemReviewer(isZh),
    isZh
      ? `Plan:\n${planner.content}\n\nDraft:\n${writer.content}\n\n请输出简洁的 Revision Notes。`
      : `Plan:\n${planner.content}\n\nDraft:\n${writer.content}\n\nReturn concise revision notes only.`
  );
  let reviewerSnapshot = "";
  const reviewer = await streamWithFallback({
    stage: "reviewer",
    messages: reviewerMsgs,
    groqKey,
    groqModel,
    openrouterKey,
    openrouterCandidates: OR_REVIEWER_CANDIDATES,
    onDelta: (delta) => {
      reviewerSnapshot += delta;
      void reviewerSnapshot;
    },
  });

  const revisionNotes = extractSection(reviewer.content, ["[Revision Notes]", "Revision Notes:", "修订说明：", "修订说明"]);

  const finalMsgs = buildStageMessages(
    messages,
    systemWorkflowReviewer(isZh),
    isZh
      ? `Plan:\n${planner.content}\n\nDraft:\n${writer.content}\n\nRevision Notes:\n${revisionNotes}\n\n请输出最终版本。`
      : `Plan:\n${planner.content}\n\nDraft:\n${writer.content}\n\nRevision Notes:\n${revisionNotes}\n\nRewrite this into an improved final draft and append a short conclusion.`
  );

  let finalSnapshot = "";
  const final = await streamWithFallback({
    stage: "reviewer",
    messages: finalMsgs,
    groqKey,
    groqModel,
    openrouterKey,
    openrouterCandidates: OR_FINAL_CANDIDATES,
    onDelta: (delta) => {
      finalSnapshot += delta;
      onReviewerDelta?.(delta, finalSnapshot);
    },
  });

  return {
    planner: { ...planner, content: normalizeAiText(planner.content) },
    writer: { ...writer, content: normalizeAiText(writer.content) },
    reviewer: { ...reviewer, content: normalizeAiText(revisionNotes) },
    final: { ...final, content: normalizeAiText(final.content) },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      model?: ModelKind;
      mode?: Mode;
      chatSessionId?: string | null;
      lang?: "zh" | "en";
    };

    const messages = body.messages;
    const mode = body.mode ?? "single";
    const modelKind = body.model ?? "fast";
    let chatSessionId = body.chatSessionId ?? null;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonErr(400, "MISSING_MESSAGES", "Missing messages");
    }
    if (mode === "detector") {
      return jsonErr(400, "DETECTOR_MODE_NOT_ALLOWED", "Detector mode uses /api/ai-detector.");
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return jsonErr(500, "MISSING_GROQ_API_KEY", "Missing GROQ_API_KEY");
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;

    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    const shouldSaveChat = Boolean(userId) && (mode === "single" || mode === "team");
    const shouldBillChat = Boolean(userId) && (mode === "single" || mode === "team");

    if (shouldBillChat) {
      try {
        await assertQuotaOrThrow({ userId: userId!, action: "chat", amount: 1 });
      } catch (error) {
        if (error instanceof QuotaError) {
          return NextResponse.json({ ok: false, error: error.code, message: error.message }, { status: error.status ?? 429 });
        }
        throw error;
      }
    }

    const isZh = body.lang === "zh" || /[\u4e00-\u9fff]/.test(getLastUserText(messages));
    const userRequest = getLastUserText(messages);
    if (!userRequest) return jsonErr(400, "NO_USER_INPUT", "No user message found");

    if (shouldBillChat) {
      try {
        await assertChatRequestAllowed(userId!, userRequest);
      } catch (error) {
        if (error instanceof ChatLimitError) {
          return NextResponse.json({ ok: false, error: error.code, message: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    if (wantsSSE(request)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const send = (event: string, payload: any) => controller.enqueue(encoder.encode(sseEvent(event, payload)));

          try {
            send("status", { ok: true, stage: "thinking", message: "Thinking..." });

            if (shouldSaveChat) {
              chatSessionId = await ensureSessionId({ userId: userId!, chatSessionId, userRequest });
              await safeSave(() => saveChatMessage(chatSessionId!, "user", userRequest));
            }

            if (mode === "single") {
              send("stage_start", { stage: "writer" });
              const writerMsgs = buildStageMessages(
                messages,
                systemAssistant(isZh),
                isZh ? `用户需求：\n${userRequest}\n\n请直接给出最终回答。` : `User request:\n${userRequest}\n\nGive the final answer.`
              );
              const writer = await tryGroqFirst({
                stage: "writer",
                messages: writerMsgs,
                groqKey,
                groqModel,
                openrouterKey,
                openrouterCandidates: OR_WRITER_CANDIDATES,
              });
              const reply = normalizeAiText(writer.content);
              send("stage_done", { ...writer, content: reply });
              if (shouldSaveChat && chatSessionId) {
                await safeSave(() => saveChatMessage(chatSessionId!, "assistant", reply));
              }
              if (shouldBillChat) {
                addUsageEvent(userId!, "chat_count", 1).catch((error) => console.error("usageEvent write failed:", error));
              }
              send("done", { ok: true, chatSessionId, stages: [{ ...writer, content: reply }], reply });
              controller.close();
              return;
            }

            send("stage_start", { stage: "planner" });
            send("stage_start", { stage: "writer" });
            send("stage_start", { stage: "reviewer" });

            const team = await buildTeamOutputs({
              messages,
              userRequest,
              isZh,
              groqKey,
              groqModel,
              openrouterKey,
              onWriterDelta: (delta, snapshot) => {
                send("stage_delta", { stage: "writer", delta, content: snapshot });
              },
              onReviewerDelta: (delta, snapshot) => {
                send("stage_delta", { stage: "reviewer", delta, content: snapshot });
              },
            });

            send("stage_done", team.planner);
            send("stage_done", team.writer);
            send("stage_done", team.final);

            if (shouldSaveChat && chatSessionId) {
              await safeSave(() => saveChatMessage(chatSessionId!, "assistant", team.final.content));
            }
            if (shouldBillChat) {
              addUsageEvent(userId!, "chat_count", 1).catch((error) => console.error("usageEvent write failed:", error));
            }

            send("done", {
              ok: true,
              chatSessionId,
              stages: [team.planner, team.writer, team.final],
              reviewSummary: team.reviewer.content,
              reply: team.final.content,
            });
            controller.close();
          } catch (error: any) {
            console.error("[/api/chat] pipeline error:", error?.message || error);
            const mapped = mapUpstreamError(error);
            send("error", { ok: false, error: mapped.error, message: mapped.message, extra: mapped.extra });
            controller.close();
          }
        },
      });

      return new Response(stream, { headers: sseHeaders() });
    }

    if (shouldSaveChat) {
      chatSessionId = await ensureSessionId({ userId: userId!, chatSessionId, userRequest });
      await safeSave(() => saveChatMessage(chatSessionId!, "user", userRequest));
    }

    if (mode === "single") {
      const writerMsgs = buildStageMessages(
        messages,
        systemAssistant(isZh),
        isZh ? `用户需求：\n${userRequest}\n\n请直接给出最终回答。` : `User request:\n${userRequest}\n\nGive the final answer.`
      );
      const writer = await tryGroqFirst({
        stage: "writer",
        messages: writerMsgs,
        groqKey,
        groqModel,
        openrouterKey,
        openrouterCandidates: OR_WRITER_CANDIDATES,
      });
      const reply = normalizeAiText(writer.content);

      if (shouldSaveChat && chatSessionId) {
        await safeSave(() => saveChatMessage(chatSessionId!, "assistant", reply));
      }
      if (shouldBillChat) {
        addUsageEvent(userId!, "chat_count", 1).catch((error) => console.error("usageEvent write failed:", error));
      }

      return NextResponse.json({ ok: true, chatSessionId, stages: [{ ...writer, content: reply }], reply });
    }

    const team = await buildTeamOutputs({
      messages,
      userRequest,
      isZh,
      groqKey,
      groqModel,
      openrouterKey,
    });

    if (shouldSaveChat && chatSessionId) {
      await safeSave(() => saveChatMessage(chatSessionId!, "assistant", team.final.content));
    }
    if (shouldBillChat) {
      addUsageEvent(userId!, "chat_count", 1).catch((error) => console.error("usageEvent write failed:", error));
    }

    return NextResponse.json({
      ok: true,
      chatSessionId,
      stages: [team.planner, team.writer, team.final],
      reviewSummary: team.reviewer.content,
      reply: team.final.content,
    });
  } catch (error: any) {
    console.error("[/api/chat] error:", error?.message || error);
    const mapped = mapUpstreamError(error);
    return jsonErr(mapped.status, mapped.error, mapped.message, mapped.extra);
  }
}
