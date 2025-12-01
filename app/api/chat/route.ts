import { NextResponse } from "next/server";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Mode = "single" | "team";
type ModelKind = "fast" | "quality";

const FAST_MODEL = "llama-3.1-8b-instant";
// 预留：高质量模型，如果暂时没有合适的 70B，也可以先用同一个
const QUALITY_MODEL = "llama-3.1-8b-instant";

// HuggingFace 写作模型：DeepSeek + Kimi
const HF_DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";
const HF_KIMI_MODEL = "moonshotai/Kimi-K2-Instruct-0905";

// ------------------ 通用调用函数 ------------------

// 调 Groq
async function callGroqChat(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
    }),
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
  if (!reply) {
    throw new Error("Groq 没有返回 message.content。");
  }
  return reply as string;
}

// 调 HuggingFace（router）
async function callHuggingFaceChat(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch(
    "https://router.huggingface.co/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
      }),
    }
  );

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
  if (!reply) {
    throw new Error("HuggingFace 没有返回 message.content");
  }

  return reply as string;
}

// 预备好的本地 Ollama 调用（现在没用到，先放着）
async function callLocalOllamaChat(
  modelId: string,
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch("http://localhost:11434/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Ollama 的 OpenAI 兼容接口要求有个 api_key 字段，但内容无所谓
      Authorization: "Bearer ollama",
    },
    body: JSON.stringify({
      model: modelId, // 比如 "deepseek-r1:8b" 或 "llama3.1"
      messages,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Local AI (Ollama) 返回错误：", res.status, text);
    throw new Error(`调用 Local AI 失败：${res.status}\n${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Local AI JSON 解析失败：", e, text);
    throw new Error("Local AI 返回内容无法解析");
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Local AI 没有返回 message.content");
  }

  return reply as string;
}

// ------------------ 单模型模式：保持原样，用 Groq ------------------

async function handleSingleMode(
  apiKey: string,
  modelKind: ModelKind,
  messages: ChatMessage[]
) {
  const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;
  const reply = await callGroqChat(apiKey, groqModel, messages);
  return reply;
}

// ------------------ 多 Agent 讨论模式：DeepSeek + Kimi + Groq ------------------

async function handleTeamMode(
  apiKey: string,
  modelKind: ModelKind,
  messages: ChatMessage[]
) {
  const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;

  // 取最后一句用户的话作为“主需求”
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userRequest =
    lastUser?.content ?? "请根据以上对话完成任务。";

  const hfKey = process.env.HF_TOKEN;
  if (!hfKey) {
    throw new Error(
      "服务器缺少 HF_TOKEN（请在 .env.local 和 Vercel 环境变量中配置）。"
    );
  }

  // 1️⃣ Agent A：DeepSeek 先给出完整方案（偏逻辑 / 推理型）
  const aMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent A，一名擅长分析和推理的高级 AI 顾问。",
        "你的任务：认真理解用户的问题，给出一份结构清晰、逻辑严谨的回答。",
        "",
        "要求：",
        "1. 先在心中拆解问题，再给出分点回答；",
        "2. 可以适度发散，但不要离题；",
        "3. 不要解释你是 AI，也不要提到“其他智能体”的存在。"
      ].join("\n"),
    },
    {
      role: "user",
      content:
        "用户的问题或需求如下，请直接给出你的完整回答：\n\n" +
        userRequest,
    },
  ];

  const replyA = await callHuggingFaceChat(
    hfKey,
    HF_DEEPSEEK_MODEL,
    aMessages
  );

  // 2️⃣ Agent B：Kimi 看到 Agent A 的回答后，补充 & 纠正（偏表达 /中文风格）
  const bMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent B，一名擅长中文表达与用户体验的高级 AI 顾问。",
        "你会看到 Agent A 的回答，你的任务是：在尊重用户需求的前提下，批判性地阅读 Agent A 的答案，然后给出一份你认为更合适的版本。",
        "",
        "要求：",
        "1. 先在心中分析 Agent A 的优点和缺点（是否啰嗦、是否有遗漏点、是否不够贴近用户）；",
        "2. 在输出时，不要写分析过程，直接给出你“改良后”的完整回答；",
        "3. 语言要自然、流畅，更贴近真实中文互联网产品/内容风格；",
        "4. 不要提到 Agent A，不要暴露有“其他智能体存在”。"
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "用户的原始需求是：",
        userRequest,
        "",
        "下面是 Agent A 的回答，请你在心中参考它，然后给出你认为更好的版本：",
        "===== Agent A 的回答开始 =====",
        replyA,
        "===== Agent A 的回答结束 =====",
      ].join("\n"),
    },
  ];

  const replyB = await callHuggingFaceChat(
    hfKey,
    HF_KIMI_MODEL,
    bMessages
  );

  // 3️⃣ Agent C：Groq 作为“总导演”，看完 A 和 B，给出最终综合回答
  const cMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent C，一名总负责人 / 主笔编辑，负责综合多名 AI 顾问的回答，给用户一个最终版本。",
        "",
        "你将看到：",
        "- 用户的原始问题；",
        "- Agent A 的回答（偏推理与结构）；",
        "- Agent B 的回答（偏表达与体验）。",
        "",
        "你的任务：",
        "1. 在心中比较 A 和 B 的优缺点；",
        "2. 只输出一个【最终版回答】：",
        "   - 逻辑清晰，信息完整；",
        "   - 用词自然、友好、容易理解；",
        "   - 尽量覆盖两边的优点，避免重复与啰嗦；",
        "3. 不要提到 A/B/C，不要说“我综合了其他模型”，只当自己是唯一的助手在回答用户。",
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
        "请根据以上内容，给出你综合后的最终回答。"
      ].join("\n"),
    },
  ];

  const finalReply = await callGroqChat(apiKey, groqModel, cMessages);

  // 目前只把最终综合结果返回给用户
  return finalReply;
}


// ------------------ Next.js 路由入口 ------------------

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      model?: ModelKind;
      mode?: Mode;
    };

    const messages = body.messages;
    const modelKind = body.model ?? "fast";
    const mode = body.mode ?? "single";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { reply: "请求 body 中缺少 messages 数组。" },
        { status: 200 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "服务器缺少 GROQ_API_KEY（请检查 .env.local）。" },
        { status: 200 }
      );
    }

    let reply: string;

    if (mode === "team") {
      reply = await handleTeamMode(apiKey, modelKind, messages);
    } else {
      reply = await handleSingleMode(apiKey, modelKind, messages);
    }

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("API /api/chat 出错：", err);
    return NextResponse.json(
      {
        reply:
          "服务器内部错误：" +
          (err?.message ?? "未知错误") +
          "（请稍后重试）",
      },
      { status: 200 }
    );
  }
}
