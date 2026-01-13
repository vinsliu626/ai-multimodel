// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // 如果你的路径不同，改这里

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
    console.error("Groq 返回错误：", res.status, text);
    throw new Error(`调用 Groq 失败：${res.status}\n${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("解析 Groq JSON 失败：", e, text);
    throw new Error("Groq 返回内容无法解析。");
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq 没有返回 message.content。");
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
    console.error("HF 返回错误：", res.status, text);
    throw new Error(`调用 HuggingFace 失败：${res.status}\n${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("HF JSON 解析失败：", e, text);
    throw new Error("HuggingFace 返回内容无法解析");
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("HuggingFace 没有返回 message.content");
  return reply as string;
}

// ---------- 单模型模式 ----------
async function handleSingleMode(
  apiKey: string,
  modelKind: ModelKind,
  messages: ChatMessage[],
  singleModelKey: SingleModelKey
) {
  switch (singleModelKey) {
    case "groq_fast":
      return await callGroqChat(apiKey, FAST_MODEL, messages);
    case "groq_quality":
      return await callGroqChat(apiKey, QUALITY_MODEL, messages);
    case "hf_deepseek": {
      const hfKey = process.env.HF_TOKEN;
      if (!hfKey) throw new Error("服务器缺少 HF_TOKEN（请在环境变量中配置）。");
      return await callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, messages);
    }
    case "hf_kimi": {
      const hfKey = process.env.HF_TOKEN;
      if (!hfKey) throw new Error("服务器缺少 HF_TOKEN（请在环境变量中配置）。");
      return await callHuggingFaceChat(hfKey, HF_KIMI_MODEL, messages);
    }
    default: {
      const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;
      return await callGroqChat(apiKey, groqModel, messages);
    }
  }
}

// ---------- 多 Agent 团队模式 ----------
async function handleTeamMode(apiKey: string, modelKind: ModelKind, messages: ChatMessage[]) {
  const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userRequest = lastUser?.content ?? "请根据以上对话完成任务。";

  const hfKey = process.env.HF_TOKEN;
  if (!hfKey) throw new Error("服务器缺少 HF_TOKEN（请在环境变量中配置）。");

  const aMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent A，一名擅长分析和推理的高级 AI 顾问。",
        "你的任务：认真理解用户的问题，给出一份结构清晰、逻辑严谨的回答。",
        "要求：1）分点回答；2）不过度发散；3）不要提到其他智能体。",
      ].join("\n"),
    },
    {
      role: "user",
      content: "用户的问题或需求如下，请直接给出你的完整回答：\n\n" + userRequest,
    },
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
    {
      role: "user",
      content: "用户的问题或需求如下，请直接给出你的完整回答：\n\n" + userRequest,
    },
  ];

  const [replyA, replyB] = await Promise.all([
    callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, aMessages),
    callHuggingFaceChat(hfKey, HF_KIMI_MODEL, bMessages),
  ]);

  const cMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent C，一名总负责人 / 主笔编辑，负责综合多名 AI 顾问的回答，给用户一个最终版本。",
        "你将看到：用户原始需求、Agent A 的回答（偏推理）、Agent B 的回答（偏表达）。",
        "",
        "你的任务：",
        "1. 在心中比较 A 和 B；",
        "2. 只输出一个【最终版回答】：逻辑清晰、信息完整、用词自然；",
        "3. 默认用“我”来回答。",
        "4. 如果用户明确问“是不是多个 AI 一起协作”“你们的原理是什么”等，请如实告知：",
        "   这是一个由多个模型协作的系统（一个偏推理，一个偏表达），你负责综合后给出答案。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "【用户原始需求】",
        userRequest,
        "",
        "【Agent A 的回答】",
        replyA,
        "",
        "【Agent B 的回答】",
        replyB,
        "",
        "请根据以上内容，给出你综合后的最终回答。",
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

  const cleaned = firstLine.replace(/^标题[:：]\s*/, "").slice(0, 20);
  return cleaned || "新的对话";
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
      return NextResponse.json({ ok: false, error: "MISSING_MESSAGES" }, { status: 400 });
    }

    // ✅ 防误用：Detector 不走 /api/chat
    if (mode === "detector") {
      return NextResponse.json(
        { ok: false, error: "DETECTOR_MODE_NOT_ALLOWED", reply: "Detector mode uses /api/ai-detector." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "MISSING_GROQ_API_KEY" }, { status: 500 });
    }

    // ✅ 取登录用户（未登录也能聊天，但不存储/不计费/不限制）
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    // ✅ 登录用户：先做配额检查（chat 10/天，pro/ultra/礼包无限制会自动放行）
    if (userId) {
      try {
        await assertQuotaOrThrow({ userId, action: "chat", amount: 1 });
      } catch (e) {
        if (e instanceof QuotaError) {
          return NextResponse.json(
            { ok: false, error: e.code, message: e.message },
            { status: 429 }
          );
        }
        throw e;
      }
    }

    // ✅ 调模型
    let reply: string;
    if (mode === "team") {
      reply = await handleTeamMode(apiKey, modelKind, messages);
    } else {
      reply = await handleSingleMode(apiKey, modelKind, messages, singleModelKey);
    }

    // ✅ 登录用户：记一次用量 + 保存聊天
    if (userId) {
      // 先记用量（你也可以放在 db 成功后再记）
      await addUsageEvent(userId, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));

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
            data: { userId, title },
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

    // 未登录：只返回 reply，不保存 sessionId
    return NextResponse.json({ ok: true, reply, chatSessionId });
  } catch (err: any) {
    console.error("API /api/chat 出错：", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: err?.message ?? "未知错误" },
      { status: 500 }
    );
  }
}