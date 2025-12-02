import { NextResponse } from "next/server";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Mode = "single" | "team";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";


const FAST_MODEL = "llama-3.1-8b-instant";
// 预留：高质量模型，如果暂时没有合适的 70B，也可以先用同一个
const QUALITY_MODEL = "llama-3.3-70b-versatile";;

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

// ------------------ 单模型模式：根据 singleModelKey 选择不同模型 ------------------

async function handleSingleMode(
  apiKey: string,
  modelKind: ModelKind,
  messages: ChatMessage[],
  singleModelKey: SingleModelKey
) {
  // 默认：如果前端没传，就按原来的 fast/quality 逻辑用 Groq
  if (!singleModelKey) {
    const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;
    return await callGroqChat(apiKey, groqModel, messages);
  }

  // 单模型模式显式选择
  switch (singleModelKey) {
    case "groq_fast": {
      return await callGroqChat(apiKey, FAST_MODEL, messages);
    }
    case "groq_quality": {
      return await callGroqChat(apiKey, QUALITY_MODEL, messages);
    }
    case "hf_deepseek": {
      const hfKey = process.env.HF_TOKEN;
      if (!hfKey) {
        throw new Error(
          "服务器缺少 HF_TOKEN（请在 .env.local 和 Vercel 环境变量中配置）。"
        );
      }
      return await callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, messages);
    }
    case "hf_kimi": {
      const hfKey = process.env.HF_TOKEN;
      if (!hfKey) {
        throw new Error(
          "服务器缺少 HF_TOKEN（请在 .env.local 和 Vercel 环境变量中配置）。"
        );
      }
      return await callHuggingFaceChat(hfKey, HF_KIMI_MODEL, messages);
    }
    default: {
      // 安全兜底：当成 Groq 快速
      return await callGroqChat(apiKey, FAST_MODEL, messages);
    }
  }
}


// ------------------ 多 Agent 讨论模式（并行）：DeepSeek + Kimi + Groq ------------------

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

  // 1️⃣ Agent A：DeepSeek —— 偏分析、结构和推理
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

  // 2️⃣ Agent B：Kimi —— 偏表达、案例和用户体验
  const bMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是 Agent B，一名擅长中文表达与用户体验的高级 AI 顾问。",
        "你会看到与用户同样的需求，你的任务是：在尊重用户需求的前提下，给出一份更贴近年轻人、容易理解的版本。",
        "",
        "要求：",
        "1. 回答时可以多用例子、场景，让内容更接地气；",
        "2. 结构要清晰，但语言可以更自然一点；",
        "3. 不要提到 Agent A，不要暴露有“其他智能体存在”；",
        "4. 不要解释你是 AI，只当自己是这个产品的顾问在说话。"
      ].join("\n"),
    },
    {
      role: "user",
      content:
        "用户的问题或需求如下，请直接给出你的完整回答：\n\n" +
        userRequest,
    },
  ];

  // ⚡ 3️⃣ 并行调用：让 DeepSeek 和 Kimi 同时思考
  const [replyA, replyB] = await Promise.all([
    callHuggingFaceChat(hfKey, HF_DEEPSEEK_MODEL, aMessages),
    callHuggingFaceChat(hfKey, HF_KIMI_MODEL, bMessages),
  ]);

  // 4️⃣ Agent C：Groq 作为“总导演”，看完 A 和 B，给出最终综合回答
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
        "",
        "【关于是否说明“多模型协作”的规则】",
        "3. 默认情况下，你可以用第一人称“我”来回答，不必反复强调自己是由多个模型组成。",
        "4. 但当用户主动问类似问题时，比如：",
        "   - “你是多个 AI 一起工作吗？”",
        "   - “背后是不是有好几个模型在讨论？”",
        "   - “你们的协作原理是什么？”",
        "   请如实说明：你是一个对话窗口，背后有多个不同能力的 AI 顾问在协作（例如一个偏推理、一个偏表达），你会综合它们的结果再给出最终答案。",
        "5. 可以简单描述分工逻辑，但不要输出过多底层技术细节代码；重点是让用户听得懂、安心使用。",
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
      singleModelKey?: SingleModelKey;
    };

    const messages = body.messages;
    const modelKind = body.model ?? "fast";
    const mode = body.mode ?? "single";
    const singleModelKey = body.singleModelKey ?? "groq_fast";

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
  reply = await handleSingleMode(apiKey, modelKind, messages, singleModelKey);
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
