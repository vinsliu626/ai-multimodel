"use client";

import { useState } from "react";
import Link from "next/link";

type Lang = "zh" | "en";

export default function Home() {
  const [lang, setLang] = useState<Lang>("zh");
  const isZh = lang === "zh";

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute -top-40 -left-20 w-80 h-80 bg-blue-500/30 blur-3xl rounded-full animate-pulse" />
      <div className="pointer-events-none absolute -bottom-40 -right-10 w-96 h-96 bg-purple-500/25 blur-3xl rounded-full animate-pulse" />

      {/* 顶部导航：Logo + 语言切换 + 快速入口 */}
      <header className="relative z-10 px-6 pt-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* 左侧 Logo / 标题 */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-purple-500 shadow-lg shadow-blue-500/40" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                Multi-Model AI
              </p>
              <p className="text-sm font-semibold">
                {isZh ? "AI 辅导" : "AI Tutor"}
              </p>
            </div>
          </div>

          {/* 右侧：语言切换 + 进入聊天 */}
          <div className="flex items-center gap-3">
            {/* 语言切换 */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
              <span className="text-slate-300 mr-1">🌐</span>
              <button
                onClick={() => setLang("zh")}
                className={`px-2 py-0.5 rounded-full transition ${
                  isZh
                    ? "bg-slate-100 text-slate-900 text-[11px] font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                中
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-2 py-0.5 rounded-full transition ${
                  !isZh
                    ? "bg-slate-100 text-slate-900 text-[11px] font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            {/* 快速进入聊天 */}
            <Link
              href="/chat"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-900 text-xs font-medium shadow-md shadow-slate-900/40 hover:brightness-110 transition"
            >
              <span>{isZh ? "进入工作台" : "Open Workspace"}</span>
              <span>↗</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero 区域 */}
      <section className="relative px-6 pt-16 pb-24">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12">
          {/* 左侧文字 */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isZh
                ? "多模型协作 · Groq + DeepSeek + Kimi"
                : "Multi-model orchestration · Groq + DeepSeek + Kimi"}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
                {isZh
                  ? "多模型 AI 工作台"
                  : "Multi-Model AI Workspace"}
              </span>
              <span className="block mt-2 text-slate-100 text-2xl sm:text-3xl">
                {isZh
                  ? "让多个 AI 一起，帮你完成一件事"
                  : "Let multiple AIs team up on one task"}
              </span>
            </h1>

            <p className="mt-6 text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              {isZh ? (
                <>
                  一个平台接入 Groq、DeepSeek、Kimi，多智能体协作完成写作、
                  分析、代码、课程设计、训练营方案等复杂任务。
                  <br />
                  你只需要提需求，后面的讨论和分工都交给 AI 团队。
                </>
              ) : (
                <>
                  One platform that connects Groq, DeepSeek and Kimi.
                  Multi-agent collaboration for writing, analysis, code,
                  course design and bootcamp planning.
                  <br />
                  You describe what you want — the AI team handles the rest.
                </>
              )}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/chat"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 hover:scale-105 transition transform text-sm font-medium text-white text-center"
              >
                {isZh
                  ? "立即体验聊天（多模型协作）"
                  : "Try chat with multi-model mode"}
              </Link>
              <a
                href="#features"
                className="px-6 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-sm text-slate-100 text-center"
              >
                {isZh ? "查看平台功能" : "View platform features"}
              </a>
            </div>

            {/* 模型标签条 */}
            <div className="mt-8 flex flex-wrap gap-2 justify-center lg:justify-start text-[11px] text-slate-300">
              <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/40">
                ⚡ {isZh ? "Groq · 极速推理" : "Groq · ultra-fast inference"}
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/40">
                🧩 {isZh ? "DeepSeek R1 · 深度拆解" : "DeepSeek R1 · deep reasoning"}
              </span>
              <span className="px-3 py-1 rounded-full bg-pink-500/10 border border-pink-400/40">
                🎨 {isZh ? "Kimi K2 · 中文表达优化" : "Kimi K2 · writing skill"}
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-400/40">
                🤝 {isZh ? "多智能体讨论模式" : "Multi-agent discussion mode"}
              </span>
            </div>
          </div>

          {/* 右侧：多模型协作动效卡片 */}
          <div className="flex-1 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              {/* 背景发光卡 */}
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 via-cyan-400/10 to-purple-500/20 blur-3xl rounded-3xl" />
              <div className="relative rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl p-6 shadow-2xl">
                <div className="text-xs text-slate-300 mb-4 flex items-center justify-between">
                  <span>
                    {isZh ? "多智能体协作流程" : "Multi-agent flow"}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {isZh ? "在线" : "Online"}
                  </span>
                </div>

                <div className="space-y-4 text-[11px]">
                  {/* 用户需求 */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">
                      {isZh ? "你" : "You"}
                    </div>
                    <div className="flex-1 px-3 py-2 rounded-2xl bg-slate-800/80 text-slate-200">
                      {isZh
                        ? "“帮我设计一个 AI 兼职赚钱训练营…”"
                        : '"Help me design an AI side-hustle bootcamp for students..."'}
                    </div>
                  </div>

                  {/* 流程线 */}
                  <div className="h-6 flex items-center justify-center">
                    <div className="w-1/2 h-px bg-gradient-to-r from-slate-500/0 via-slate-400/70 to-slate-500/0 animate-pulse" />
                  </div>

                  {/* DeepSeek */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-[10px]">
                      A
                    </div>
                    <div className="flex-1 px-3 py-2 rounded-2xl bg-slate-800/80">
                      <div className="text-emerald-300 mb-1">
                        {isZh ? "DeepSeek · 结构规划" : "DeepSeek · Structure"}
                      </div>
                      <div className="text-slate-200">
                        {isZh
                          ? "拆解课程模块，设计阶段、节次、作业和目标。"
                          : "Breaks down modules, phases, lessons, assignments and goals."}
                      </div>
                    </div>
                  </div>

                  {/* Kimi */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-pink-500/20 border border-pink-400/60 flex items-center justify-center text-[10px]">
                      B
                    </div>
                    <div className="flex-1 px-3 py-2 rounded-2xl bg-slate-800/80">
                      <div className="text-pink-300 mb-1">
                        {isZh ? "Kimi · 文案表达" : "Kimi · Copywriting"}
                      </div>
                      <div className="text-slate-200">
                        {isZh
                          ? "把课程方案写成好懂、好卖、适合小红书/朋友圈的文案。"
                          : "Turns the plan into readable, marketable copy ready for social media."}
                      </div>
                    </div>
                  </div>

                  {/* Groq */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400/60 flex items-center justify-center text-[10px]">
                      C
                    </div>
                    <div className="flex-1 px-3 py-2 rounded-2xl bg-slate-800/80">
                      <div className="text-blue-300 mb-1">
                        {isZh ? "Groq · 终稿合成" : "Groq · Final merge"}
                      </div>
                      <div className="text-slate-200">
                        {isZh
                          ? "综合 A+B 的优点，统一风格，给你一版可以直接使用的终稿。"
                          : "Merges A+B, unifies style and gives you a final draft ready to ship."}
                      </div>
                    </div>
                  </div>

                  {/* 最终输出 */}
                  <div className="mt-3 px-3 py-2 rounded-2xl bg-gradient-to-r from-blue-600/60 to-purple-600/60 text-slate-50 shadow-lg">
                    <div className="text-xs font-semibold mb-1">
                      {isZh ? "✅ 最终输出" : "✅ Final Output"}
                    </div>
                    <div>
                      {isZh
                        ? "一键生成完整训练营方案 + 招生文案，你只需要复制粘贴去卖。"
                        : "One click to get a full bootcamp plan + marketing copy. You just copy, paste and sell."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features 区域 */}
      <section
        id="features"
        className="py-20 px-6 bg-slate-950/95 border-t border-white/5"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white">
            {isZh
              ? "为什么选择这个多模型 AI 平台？"
              : "Why choose this multi-model AI platform?"}
          </h2>
          <p className="text-center text-slate-400 mt-3 text-sm">
            {isZh
              ? "不只是“一个聊天框”，而是一套帮你真正做事的 AI 工作流。"
              : "Not just a chat box, but an AI workflow that actually gets things done."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="text-lg font-semibold">
                {isZh ? "🚀 Groq 极速引擎" : "🚀 Groq speed engine"}
              </h3>
              <p className="mt-3 text-slate-300 text-sm">
                {isZh
                  ? "基于 Groq LPU 加速，响应速度远超普通云服务，适合高频写作与头脑风暴。"
                  : "Powered by Groq LPU, much faster than typical cloud LLMs. Great for high-frequency writing & ideation."}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="text-lg font-semibold">
                {isZh ? "🧠 多智能体协同决策" : "🧠 Multi-agent decisions"}
              </h3>
              <p className="mt-3 text-slate-300 text-sm">
                {isZh
                  ? "让不同模型扮演规划、执行、审稿等角色，适合做课程、项目、商业方案。"
                  : "Different models act as planner, executor and editor. Perfect for courses, projects and strategy docs."}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-400/70 hover:shadow-xl transition transform hover:-translate-y-1">
              <h3 className="text-lg font-semibold">
                {isZh ? "📦 一站式创作工作台" : "📦 One-stop creation hub"}
              </h3>
              <p className="mt-3 text-slate-300 text-sm">
                {isZh
                  ? "写文案、写课程、做训练营、写代码、做调研问卷……在一个页面完成。"
                  : "Copywriting, course design, bootcamps, code, surveys… all in one page."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA 区域 */}
      <section className="py-20 px-6 bg-slate-950">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white">
            {isZh
              ? "想试试让一整个 AI 团队一起帮你干活吗？"
              : "Want to see an AI team work for you?"}
          </h2>
          <p className="mt-4 text-slate-300 text-sm sm:text-base">
            {isZh
              ? "打开聊天页，切换到“团队协作模式”，直接给出你的需求，剩下的拆解、写作、优化，全交给 AI。"
              : 'Open the chat page, switch to "Team mode", describe your goal, and let the AIs handle planning, drafting and polishing.'}
          </p>

          <Link
            href="/chat"
            className="inline-block mt-8 px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/30 hover:scale-105 transition text-sm font-medium"
          >
            {isZh ? "进入 AI 工作台 →" : "Go to AI workspace →"}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-500 text-xs bg-slate-950 border-t border-white/5">
        © {new Date().getFullYear()}{" "}
        {isZh ? "多模型 AI 平台" : "Multi-Model AI Platform"} · Made by vins 
      </footer>
    </main>
  );
}
