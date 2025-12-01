import { NextResponse } from "next/server";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const { messages, model } = (await request.json()) as {
      messages?: ChatMessage[];
      model?: "fast" | "quality";
    };

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

    // ✅ 根据前端传来的 model 字段，选择不同 Groq 模型
    const groqModel =
      model === "quality"
        ? "llama-3.1-8b-instant"
        : "llama-3.1-8b-instant"; // 默认 fast

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages,
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("Groq 返回错误：", res.status, text);
      return NextResponse.json(
        { reply: `调用 Groq 失败：${res.status}\n${text}` },
        { status: 200 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("解析 Groq JSON 失败：", e, text);
      return NextResponse.json(
        { reply: "Groq 返回内容无法解析，请检查服务器日志。" },
        { status: 200 }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content || "Groq 没有返回 message.content。";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("API /api/chat 出错：", err);
    return NextResponse.json(
      { reply: "服务器内部错误，请检查 /api/chat 日志。" },
      { status: 200 }
    );
  }
}
