"use client";

import { useState } from "react";

type Role = "user" | "assistant";

type Message = {
  role: Role;
  content: string;
};

type Mode = "single" | "team";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";


export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  

  // 模式：单模型 / 团队协作
  const [mode, setMode] = useState<Mode>("single");
  // 模型：快速 / 高质量
  const [modelKind, setModelKind] = useState<ModelKind>("fast");
  const [singleModelKey, setSingleModelKey] = useState<SingleModelKey>("groq_fast");


  // 发送 + 打字机效果
  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const userMessage: Message = { role: "user", content: userText };

    // 给后端用的“历史对话”（这里用变量，不依赖异步的 setState）
    const historyForApi = [...messages, userMessage];

    // ✅ 前端只加一次用户消息 + 一个空的助手占位
    setMessages((prev) => [
      ...prev,
      userMessage,
      { role: "assistant", content: "" },
    ]);

    try {
      // 调用后端 /api/chat
      const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
    messages: historyForApi,
    mode,
    model: modelKind,       // 团队模式用的 fast/quality
    singleModelKey,         // 单模型模式用的具体模型
  }),
});


      const data = await res.json();
      const fullReply: string = data.reply ?? "AI 暂时没有返回内容。";

      // 打字机效果：一点点把内容写进“最后一条助手消息”
      const step = 2; // 每次加几个字符
      let i = 0;

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          i += step;
          const slice = fullReply.slice(0, i);

          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const lastIndex = next.length - 1;

            // 确保最后一条是 assistant，再更新
            if (next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                ...next[lastIndex],
                content: slice,
              };
            }

            return next;
          });

          if (i >= fullReply.length) {
            clearInterval(timer);
            resolve();
          }
        }, 20); // 间隔可以调大/调小
      });
    } catch (err) {
      console.error("调用 /api/chat 出错：", err);
      // 出错时，把错误信息显示成一条 AI 消息
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "调用后端出错了，请稍后重试。\n\n错误信息：" +
            (err instanceof Error ? err.message : String(err)),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center bg-gray-100 p-4">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-md flex flex-col h-[80vh]">
        {/* 顶部标题 + 模式选择 */}
        <header className="border-b px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold text-lg">多模型 AI 助手 · 聊天测试版</h1>
            <p className="text-xs text-gray-500">
              后端：Groq + DeepSeek + Kimi · 前端：本地打字机流式效果
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">模式</span>
              <button
                onClick={() => setMode("single")}
                className={`px-2 py-1 rounded border text-xs ${
                  mode === "single"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700"
                }`}
              >
                单模型
              </button>
              <button
                onClick={() => setMode("team")}
                className={`px-2 py-1 rounded border text-xs ${
                  mode === "team"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700"
                }`}
              >
                团队协作
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
  <span className="text-gray-500">
    {mode === "single" ? "单模型" : "团队模型"}
  </span>

  {mode === "single" ? (
    <>
      <button
        onClick={() => setSingleModelKey("groq_fast")}
        className={`px-2 py-1 rounded border text-xs ${
          singleModelKey === "groq_fast"
            ? "bg-green-600 text-white border-green-600"
            : "bg-white text-gray-700"
        }`}
      >
        GPT Fast
      </button>
      <button
        onClick={() => setSingleModelKey("groq_quality")}
        className={`px-2 py-1 rounded border text-xs ${
          singleModelKey === "groq_quality"
            ? "bg-purple-600 text-white border-purple-600"
            : "bg-white text-gray-700"
        }`}
      >
        GPT Pro
      </button>
      <button
        onClick={() => setSingleModelKey("hf_deepseek")}
        className={`px-2 py-1 rounded border text-xs ${
          singleModelKey === "hf_deepseek"
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-700"
        }`}
      >
        DeepSeek
      </button>
      <button
        onClick={() => setSingleModelKey("hf_kimi")}
        className={`px-2 py-1 rounded border text-xs ${
          singleModelKey === "hf_kimi"
            ? "bg-pink-600 text-white border-pink-600"
            : "bg-white text-gray-700"
        }`}
      >
        Kimi
      </button>
    </>
  ) : (
    <>
      <button
        onClick={() => setModelKind("fast")}
        className={`px-2 py-1 rounded border text-xs ${
          modelKind === "fast"
            ? "bg-green-600 text-white border-green-600"
            : "bg-white text-gray-700"
        }`}
      >
        快速
      </button>
      <button
        onClick={() => setModelKind("quality")}
        className={`px-2 py-1 rounded border text-xs ${
          modelKind === "quality"
            ? "bg-purple-600 text-white border-purple-600"
            : "bg-white text-gray-700"
        }`}
      >
        高质量
      </button>
    </>
  )}
</div>

          </div>
        </header>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-gray-400 text-sm text-center mt-10">
              还没有消息，试试输入点什么吧 👇
              <br />
              比如：“帮我设计一个调查表”
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900 border"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="text-xs text-gray-500 mt-2">
              {mode === "team"
                ? "多模型团队正在协作思考中……"
                : "模型正在思考中……"}
            </div>
          )}
        </div>

        {/* 底部输入框 */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <textarea
              className="flex-1 border rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入你的问题，按 Enter 发送，Shift+Enter 换行"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="w-24 h-10 self-end rounded-md bg-blue-600 text-white text-sm disabled:bg-gray-300"
            >
              {isLoading ? "思考中..." : "发送"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
