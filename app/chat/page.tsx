"use client";

import React, { useState } from "react";

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
  // 团队模式下：模型类型（快速 / 高质量）
  const [modelKind, setModelKind] = useState<ModelKind>("fast");
  // 单模型模式：具体选用哪个模型
  const [singleModelKey, setSingleModelKey] =
    useState<SingleModelKey>("groq_fast");

  // 当前模型标签文案
  const currentModelLabel = (() => {
    if (mode === "team") {
      return modelKind === "fast"
        ? "团队协作 · 快速模式（Groq + DeepSeek + Kimi）"
        : "团队协作 · 高质量模式（Groq 70B + DeepSeek + Kimi）";
    }
    switch (singleModelKey) {
      case "groq_fast":
        return "单模型 · Groq 极速（llama-3.1-8b-instant）";
      case "groq_quality":
        return "单模型 · Groq 高质量（llama-3.3-70b-versatile）";
      case "hf_deepseek":
        return "单模型 · DeepSeek R1（HuggingFace）";
      case "hf_kimi":
        return "单模型 · Kimi K2（HuggingFace）";
      default:
        return "单模型";
    }
  })();

  // 发送 + 打字机效果
  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const userMessage: Message = { role: "user", content: userText };

    // 给后端用的“历史对话”
    const historyForApi = [...messages, userMessage];

    // 前端只加一次用户消息 + 一个空的助手占位
    setMessages((prev) => [
      ...prev,
      userMessage,
      { role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          mode,
          model: modelKind, // 团队模式用的 fast/quality
          singleModelKey, // 单模型模式用的具体模型
        }),
      });

      const data = await res.json();
      const fullReply: string = data.reply ?? "AI 暂时没有返回内容。";

      // 打字机效果：一点点把内容写进“最后一条助手消息”
      const step = 2;
      let i = 0;

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          i += step;
          const slice = fullReply.slice(0, i);

          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const lastIndex = next.length - 1;

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
        }, 20);
      });
    } catch (err) {
      console.error("调用 /api/chat 出错：", err);
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
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-3 py-6">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute -top-32 -left-10 w-64 h-64 bg-blue-500/30 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 -right-10 w-72 h-72 bg-purple-500/25 blur-3xl rounded-full" />

      <div className="relative w-full max-w-5xl h-[80vh] bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <header className="border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-xs font-bold">
              AI
            </div>
            <div>
              <h1 className="font-semibold text-sm sm:text-base">
                多模型 AI 聊天工作台
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                单模型 / 团队协作 · Groq · DeepSeek · Kimi
              </p>
            </div>
          </div>

          {/* 模式选择区域 */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">模式</span>
              <button
                onClick={() => setMode("single")}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  mode === "single"
                    ? "bg-blue-600 text-white border-blue-500"
                    : "bg-slate-900 text-slate-200 border-slate-600"
                }`}
                disabled={isLoading}
              >
                单模型
              </button>
              <button
                onClick={() => setMode("team")}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  mode === "team"
                    ? "bg-emerald-500 text-white border-emerald-400"
                    : "bg-slate-900 text-slate-200 border-slate-600"
                }`}
                disabled={isLoading}
              >
                团队协作
              </button>
            </div>

            {/* 模型选择 / 团队质量选择 */}
            <div className="flex flex-wrap justify-end gap-1 text-[11px] mt-1">
              {mode === "single" ? (
                <>
                  <button
                    onClick={() => setSingleModelKey("groq_fast")}
                    className={`px-2 py-1 rounded-full border ${
                      singleModelKey === "groq_fast"
                        ? "bg-blue-500 text-white border-blue-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    Groq Fast
                  </button>
                  <button
                    onClick={() => setSingleModelKey("groq_quality")}
                    className={`px-2 py-1 rounded-full border ${
                      singleModelKey === "groq_quality"
                        ? "bg-purple-500 text-white border-purple-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    Groq Pro
                  </button>
                  <button
                    onClick={() => setSingleModelKey("hf_deepseek")}
                    className={`px-2 py-1 rounded-full border ${
                      singleModelKey === "hf_deepseek"
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    DeepSeek
                  </button>
                  <button
                    onClick={() => setSingleModelKey("hf_kimi")}
                    className={`px-2 py-1 rounded-full border ${
                      singleModelKey === "hf_kimi"
                        ? "bg-pink-500 text-white border-pink-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    Kimi
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setModelKind("fast")}
                    className={`px-2 py-1 rounded-full border ${
                      modelKind === "fast"
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    快速
                  </button>
                  <button
                    onClick={() => setModelKind("quality")}
                    className={`px-2 py-1 rounded-full border ${
                      modelKind === "quality"
                        ? "bg-purple-500 text-white border-purple-400"
                        : "bg-slate-900 text-slate-200 border-slate-600"
                    }`}
                    disabled={isLoading}
                  >
                    高质量
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* 当前模型提示条 */}
        <div className="px-4 sm:px-6 py-2 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">{currentModelLabel}</span>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-sm text-slate-400">
              还没有消息，试试输入点什么吧 👇
              <br />
              <span className="text-[12px] text-slate-500">
                建议示例： “帮我设计一个...”
              </span>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={idx}
                className={`flex gap-2 sm:gap-3 ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {/* 左侧 AI 头像 / 右侧用户头像 */}
                {!isUser && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-[11px] font-semibold">
                    AI
                  </div>
                )}

                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    isUser
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-slate-800/90 text-slate-50 border border-slate-700 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[11px]">
                    你
                  </div>
                )}
              </div>
            );
          })}

          {/* 加载动画 */}
          {isLoading && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-2">
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">
                AI
              </div>
              <div className="flex items-center gap-1">
                <span>正在思考</span>
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" />
                  <span className="w-1 h-1 rounded-full bg-slate-500 animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1 h-1 rounded-full bg-slate-600 animate-bounce [animation-delay:0.3s]" />
                </span>
                {mode === "team" && (
                  <span className="text-emerald-300">
                    （多模型协作中…）
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="border-t border-white/10 bg-slate-900/80 p-3 sm:p-4">
          <div className="flex flex-col gap-2">
            {/* 小提示行 */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Enter 发送 · Shift + Enter 换行 ·{" "}
                {mode === "team" ? "适合复杂任务 / 方案类问题" : "适合快速对话 / 一问一答"}
              </span>
            </div>

            <div className="flex gap-2">
              <textarea
                className="flex-1 border border-slate-700 bg-slate-900/80 rounded-2xl px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-50 placeholder:text-slate-500"
                placeholder="输入你的需求，比如：帮我写一个 4 周的 AI 训练营课程大纲，用于在小红书招生…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="w-24 h-10 self-end rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {isLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                    <span>思考中</span>
                  </>
                ) : (
                  "发送"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
