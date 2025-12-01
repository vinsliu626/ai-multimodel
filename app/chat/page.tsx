"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<"fast" | "quality">("fast");


  // ✅ 发送「带上下文」的请求
  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };

    // 把这次用户消息加入到本地历史
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // 组装要发给后端 + Groq 的消息数组（包含 system + 全部历史）
    const payloadMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是一个为网站提供服务的多模型 AI 助手，要尽量结合上下文连续回答，用中文回复。",
      },
      ...newMessages,
    ];

    try {
      const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: payloadMessages,
    model, // 把当前选择的模式发给后端
  }),
});


      const data = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply ?? "AI 暂时没有返回内容。",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ 调用 AI 失败，请检查服务器终端是否报错。",
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
        {/* 顶部标题 */}
       <header className="border-b px-4 py-3 flex items-center justify-between gap-4">
  <div className="flex flex-col">
    <h1 className="font-semibold text-lg">多模型 AI 助手 · 聊天测试版</h1>
    <span className="text-xs text-gray-500">
      当前模型：{model === "fast" ? "快速模式 · 8B" : "高质量模式 · 70B"}
    </span>
  </div>

  {/* 模型选择下拉框 */}
  <div className="flex items-center gap-2">
    <label className="text-xs text-gray-500">模型选择</label>
    <select
      className="border rounded-md text-xs px-2 py-1"
      value={model}
      onChange={(e) =>
        setModel(e.target.value === "quality" ? "quality" : "fast")
      }
    >
      <option value="fast">⚡ 快速 · llama-3.1-8b-instant</option>
      <option value="quality">🎯 高质量 · llama-3.1-70b-versatile</option>
    </select>
  </div>
</header>


        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-gray-400 text-sm text-center mt-10">
              还没有消息，试试输入点什么吧 👇
              <br />
              例如：“我们接下来一起设计一个多模型 AI 网站”
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
                className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
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
            <div className="text-xs text-gray-500">AI 正在思考...</div>
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
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="w-24 h-10 self-end rounded-md bg-blue-600 text-white text-sm disabled:bg-gray-300"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
