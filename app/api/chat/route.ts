// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Mode = "single" | "team" | "detector";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";

const FAST_MODEL = "llama-3.1-8b-instant";
const QUALITY_MODEL = "llama-3.3-70b-versatile";

const HF_DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";
const HF_KIMI_MODEL = "moonshotai/Kimi-K2-Instruct-0905";

// ---------------- error helpers ----------------
function jsonErr(status: number, code: string, message: string, extra?: any) {
  return NextResponse.json(
    { ok: false, error: code, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function mapUpstreamError(e: any) {
  const code = String(e?.code || "");
  const httpStatus = Number(e?.httpStatus || 0);

  // HF 过载：让前端拿到明确错误码
  if (code === "HF_OVERLOADED" || httpStatus === 503) {
    return { status: 503, error: "HF_OVERLOADED", message: "HuggingFace is overloaded. Please retry in a moment." };
  }
  if (code === "HF_RATE_LIMIT" || httpStatus === 429) {
    return { status: 429, error: "HF_RATE_LIMIT", message: "HuggingFace rate limited. Please slow down and retry." };
  }
  if (code === "HF_AUTH_FAILED" || httpStatus === 401 || httpStatus === 403) {
    return { status: 500, error: "HF_AUTH_FAILED", message: "Server HF token/config invalid. Check HF_TOKEN." };
  }
  if (code.startsWith("HF_HTTP_")) {
    return { status: 502, error: code, message: "Upstream HuggingFace error." };
  }

  // Groq / others：统一给 502 更合理
  return { status: 500, error: "INTERNAL_ERROR", message: e?.message ?? "Unknown error" };
}

// ---------- 通用调用函数 ----------
async function callGroqChat(apiKey: string, modelId: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, messages }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[Groq] HTTP", res.status, text.slice(0, 300));
    throw new Error(`GROQ_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("[Groq] JSON parse failed", e, text.slice(0, 300));
    throw new Error("GROQ_BAD_JSON");
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("GROQ_NO_RESPONSE");
  return reply as string;
}

async function callHuggingFaceChat(apiKey: string, modelId: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, messages }),
  });

  const text = await res.text();

  if (!res.ok) {
    const head = text.slice(0, 300);

    const code =
      res.status === 401 || res.status === 403 ? "HF_AUTH_FAILED" :
      res.status === 429 ? "HF_RATE_LIMIT" :
      res.status === 503 ? "HF_OVERLOADED" :
      `HF_HTTP_${res.status}`;

    console.error("[HF] HTTP", { modelId, status: res.status, head });

    const err: any = new Error(`${code}: ${head}`);
    err.code = code;
    err.httpStatus = res.status;
    throw err;
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("[HF] JSON parse failed", e, text.slice(0, 300));
    const err: any = new Error("HF_BAD_JSON");
    err.code = "HF_BAD_JSON";
    err.httpStatus = 502;
    throw err;
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    const err: any = new Error("HF_NO_RESPONSE");
    err.code = "HF_NO_RESPONSE";
    err.httpStatus = 502;
    throw err;
  }
  return reply as string;
}

// ---------- 单模型模式 ----------
async function handleSingleMode(
  apiKey: string,
  modelKind: ModelKind,
  messages: ChatMessage[],
  singleModelKey: SingleModelKey
) {
  try {
    switch (singleModelKey) {
      case "groq_fast":
        return await callGroqChat(apiKey, FAST_MODEL, messages);
      case "groq_quality":
        return await callGroqChat(apiKey, QUALITY_MODEL, messages);
      case "hf_deepseek": {
        const hfKey = process.env.HF_TOKEN;
        if (!hfKey) throw Object.assign(new Error("Missing HF_TOKEN"), { code: "HF_AUTH_FAILED", httpStatus: 500 });
        return await callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, messages);
      }
      case "hf_kimi": {
        const hfKey = process.env.HF_TOKEN;
        if (!hfKey) throw Object.assign(new Error("Missing HF_TOKEN"), { code: "HF_AUTH_FAILED", httpStatus: 500 });
        return await callHuggingFaceChat(hfKey, HF_KIMI_MODEL, messages);
      }
      default: {
        const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;
        return await callGroqChat(apiKey, groqModel, messages);
      }
    }
  } catch (e: any) {
    // ✅ single 模式 fallback：如果 hf_deepseek / hf_kimi 503 -> 直接切 groq_fast（你可改策略）
    if (e?.code === "HF_OVERLOADED" || e?.httpStatus === 503) {
      console.warn("[single] HF overloaded -> fallback to groq_fast");
      return await callGroqChat(apiKey, FAST_MODEL, messages);
    }
    throw e;
  }
}

// ---------- 多 Agent 团队模式 ----------
async function handleTeamMode(apiKey: string, modelKind: ModelKind, messages: ChatMessage[]) {
  const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userRequest = lastUser?.content ?? "请根据以上对话完成任务。";

  const hfKey = process.env.HF_TOKEN;
  if (!hfKey) throw Object.assign(new Error("Missing HF_TOKEN"), { code: "HF_AUTH_FAILED", httpStatus: 500 });

  const aMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent A，一名擅长分析和推理的高级 AI 顾问。",
        "你的任务：认真理解用户的问题，给出一份结构清晰、逻辑严谨的回答。",
        "要求：1）分点回答；2）不过度发散；3）不要提到其他智能体。",
      ].join("\n"),
    },
    { role: "user", content: "用户的问题或需求如下，请直接给出你的完整回答：\n\n" + userRequest },
  ];

  const bMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent B，一名擅长中文表达与用户体验的高级 AI 顾问。",
        "你的任务：给出一份更贴近年轻人、容易理解的版本。",
        "要求：多用例子、场景；语言自然；不要提到其他智能体。",
      ].join("\n"),
    },
    { role: "user", content: "用户的问题或需求如下，请直接给出你的完整回答：\n\n" + userRequest },
  ];

  // ✅ 关键：不要 Promise.all。一个挂了不要拖死另一个
  const settled = await Promise.allSettled([
    callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, aMessages),
    callHuggingFaceChat(hfKey, HF_KIMI_MODEL, bMessages),
  ]);

  const replyA = settled[0].status === "fulfilled" ? settled[0].value : "";
  const replyB = settled[1].status === "fulfilled" ? settled[1].value : "";

  if (!replyA && !replyB) {
    // 两个都挂：抛一个明确错误（优先把 HF 的错误透出去）
    const e0 = settled[0].status === "rejected" ? settled[0].reason : null;
    const e1 = settled[1].status === "rejected" ? settled[1].reason : null;
    const err = e0 || e1 || new Error("TEAM_MODE_ALL_FAILED");
    throw err;
  }

  const cMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent C，一名总负责人 / 主笔编辑，负责综合多名 AI 顾问的回答，给用户一个最终版本。",
        "你将看到：用户原始需求、A 的回答（偏推理）、B 的回答（偏表达）。",
        "你的任务：只输出一个最终版回答（逻辑清晰、信息完整、用词自然）。",
        "如果某个回答为空，说明该模型本次不可用，请基于可用内容完成。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "【用户原始需求】",
        userRequest,
        "",
        "【Agent A 的回答】",
        replyA || "（本次不可用）",
        "",
        "【Agent B 的回答】",
        replyB || "（本次不可用）",
        "",
        "请综合输出最终回答。",
      ].join("\n"),
    },
  ];

  return await callGroqChat(apiKey, groqModel, cMessages);
}

// ---------- 生成会话标题 ----------
async function generateSessionTitle(apiKey: string, lastUserMessage: string, reply: string): Promise<string> {
  const systemMsg: ChatMessage = {
    role: "system",
    content:
      "你是一个对话标题生成器。根据用户和助手的一段对话，总结一个简短的中文标题，15 个字以内，不要引号，不要带“标题：”等前缀。",
  };

  const userMsg: ChatMessage = {
    role: "user",
    content:
      `请为下面的对话生成一个简短标题：\n\n` +
      `用户：${lastUserMessage}\n\n` +
      `助手：${reply}`,
  };

  const raw = await callGroqChat(apiKey, FAST_MODEL, [systemMsg, userMsg]);
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.replace(/^标题[:：]\s*/, "").slice(0, 20) || "新的对话";
}

// ---------- POST /api/chat ----------
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      model?: ModelKind;
      mode?: Mode;
      singleModelKey?: SingleModelKey;
      chatSessionId?: string | null;
    };

    const messages = body.messages;
    const modelKind = body.model ?? "fast";
    const mode = body.mode ?? "single";
    const singleModelKey = body.singleModelKey ?? "groq_fast";
    let chatSessionId = body.chatSessionId ?? null;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonErr(400, "MISSING_MESSAGES", "Missing messages");
    }

    if (mode === "detector") {
      return jsonErr(400, "DETECTOR_MODE_NOT_ALLOWED", "Detector mode uses /api/ai-detector.");
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return jsonErr(500, "MISSING_GROQ_API_KEY", "Missing GROQ_API_KEY");

    // 取登录用户（未登录也能聊天，但不存储/不计费/不限制）
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    // ✅ 只有 team 模式才消耗次数 / 扣配额
    // ✅ 登录用户：保存聊天（single / team 都保存）
    // ✅ 扣配额：只有 team 扣（你原本的策略）
    const shouldSaveChat = Boolean(userId) && (mode === "single" || mode === "team");
    const shouldBillChat = Boolean(userId) && (mode === "single" || mode === "team"); // ✅ single 也计入 chat 配额
    if (shouldBillChat) {
      try {
        await assertQuotaOrThrow({ userId: userId!, action: "chat", amount: 1 });
      } catch (e) {
        if (e instanceof QuotaError) {
          return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status ?? 429 });
        }
        throw e;
      }
    }

    // 调模型
    let reply: string;
    if (mode === "team") {
      reply = await handleTeamMode(apiKey, modelKind, messages);
    } else {
      reply = await handleSingleMode(apiKey, modelKind, messages, singleModelKey);
    }

    // ✅ 只有 shouldBillChat 才记用量 + 保存聊天
    // ✅ 只有 shouldBillChat 才记用量（但不影响保存）
    if (shouldBillChat) {
      await addUsageEvent(userId!, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));
    }

    // ✅ 登录用户就保存（single / team 都保存）
    if (shouldSaveChat) {
      try {
        const { prisma } = await import("@/lib/prisma");

        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        const userTextForThisTurn = lastUserMessage?.content ?? "（未找到用户消息内容）";

        if (!chatSessionId) {
          let title = "新的对话";
          try {
            title = await generateSessionTitle(apiKey, userTextForThisTurn, reply);
          } catch (e) {
            console.error("生成会话标题失败，使用兜底标题：", e);
            title = userTextForThisTurn.slice(0, 30) || "新的对话";
          }

          const sessionRow = await prisma.chatSession.create({
            data: { userId: userId!, title },
          });
          chatSessionId = sessionRow.id;
        }

        await prisma.chatMessage.createMany({
          data: [
            { chatSessionId, role: "user", content: userTextForThisTurn },
            { chatSessionId, role: "assistant", content: reply },
          ],
        });
      } catch (dbErr) {
        console.error("保存聊天记录到数据库失败：", dbErr);
      }
    }

    return NextResponse.json({ ok: true, reply, chatSessionId });
  } catch (err: any) {
    console.error("[/api/chat] error:", err?.message || err);

    const mapped = mapUpstreamError(err);
    return jsonErr(mapped.status, mapped.error, mapped.message);
  }
}