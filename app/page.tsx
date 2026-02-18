"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Lang = "en" | "zh";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/** 轻量打字机：逐字出现 */
function useTypewriter(text: string, speed = 14) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    let t: any;

    setOut("");
    setDone(false);

    const tick = () => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        return;
      }
      t = setTimeout(tick, speed);
    };

    t = setTimeout(tick, speed);
    return () => clearTimeout(t);
  }, [text, speed]);

  return { out, done };
}

/** 伪 AI 流程：累计消息，但 UI 只显示固定高度、内部滚动 */
type DemoStep = {
  side: "left" | "right";
  role: "You" | "Planner" | "Writer" | "Reviewer" | "Final";
  accent: "slate" | "blue" | "emerald" | "purple";
  title?: string;
  text: string;
};

function useLoopingDemo(steps: DemoStep[], cycleGapMs = 900) {
  const [idx, setIdx] = useState(0);
  const current = steps[idx];

  const { out, done } = useTypewriter(current.text, current.role === "You" ? 10 : 12);

  // 已经完成的消息（为了无限循环不爆炸，保留最近 N 条）
  const [feed, setFeed] = useState<DemoStep[]>([]);

  useEffect(() => {
    // 重置
    setFeed([]);
    setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!done) return;

    const t = setTimeout(() => {
      // 完成一条：把这一条加入 feed（保留最近 10 条）
      setFeed((prev) => {
        const next = [...prev, current];
        return next.slice(Math.max(0, next.length - 10));
      });
      setIdx((p) => (p + 1) % steps.length);
    }, cycleGapMs);

    return () => clearTimeout(t);
  }, [done, current, steps.length, cycleGapMs]);

  return { feed, current, typing: out };
}

function AccentDot({ accent }: { accent: DemoStep["accent"] }) {
  const cls =
    accent === "blue"
      ? "bg-blue-400"
      : accent === "emerald"
      ? "bg-emerald-400"
      : accent === "purple"
      ? "bg-purple-400"
      : "bg-slate-400";
  return <span className={cn("inline-block w-2 h-2 rounded-full", cls)} />;
}

/** 聊天气泡：左右分离 + 尾巴 + 更像人类聊天（不是代码块） */
function ChatBubble({
  side,
  role,
  accent,
  title,
  text,
  isTyping,
}: {
  side: DemoStep["side"];
  role: DemoStep["role"];
  accent: DemoStep["accent"];
  title?: string;
  text: string;
  isTyping?: boolean;
}) {
  const isLeft = side === "left";

  const baseBg =
    role === "Final"
      ? "bg-gradient-to-r from-blue-600/35 via-purple-600/25 to-emerald-500/20"
      : role === "You"
      ? "bg-white/6"
      : "bg-white/5";

  const border =
    role === "Final" ? "border-white/12" : "border-white/10";

  const nameColor =
    accent === "blue"
      ? "text-blue-200"
      : accent === "emerald"
      ? "text-emerald-200"
      : accent === "purple"
      ? "text-purple-200"
      : "text-slate-200";

  // “尾巴”用 pseudo-element-like div 模拟，左右不同
  const tail =
    isLeft ? (
      <span className="absolute left-[-6px] top-3 w-3 h-3 rotate-45 rounded-[3px] border border-white/10 bg-slate-900/60" />
    ) : (
      <span className="absolute right-[-6px] top-3 w-3 h-3 rotate-45 rounded-[3px] border border-white/10 bg-slate-900/60" />
    );

  return (
    <div className={cn("flex", isLeft ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "relative max-w-[86%] rounded-2xl border px-3 py-2 backdrop-blur-sm",
          baseBg,
          border,
          "chat-bubble"
        )}
      >
        {tail}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px]">
            <AccentDot accent={accent} />
            <span className={cn("font-semibold", nameColor)}>{role}</span>
            {title && <span className="text-slate-400">· {title}</span>}
          </div>

          {isTyping && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              typing
            </span>
          )}
        </div>

        {/* 这里改成更像“聊天内容”，避免像代码块 */}
        <div className="mt-1 text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">
          {text}
          {isTyping && (
            <span className="ml-0.5 inline-block w-2 h-3 align-middle bg-slate-200/70 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

/** NeuroDesk 球体 Logo：轻微抖动 + 变色渐变 */
function NeuroOrb() {
  return (
    <div className="relative h-9 w-9">
      <div className="absolute inset-0 rounded-2xl orb-spin orb-jitter" />
      <div className="absolute inset-0 rounded-2xl orb-glow" />
      <div className="absolute inset-[2px] rounded-2xl bg-slate-950/60 border border-white/10 backdrop-blur-sm" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-slate-100 tracking-tight">N</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en"); // 默认英文
  const isZh = lang === "zh";

  const demoSteps: DemoStep[] = useMemo(
    () => [
      {
        side: "left",
        role: "You",
        accent: "slate",
        title: "Request",
        text:
          "Summarize this lecture note about socialization.\nKeep it short and study-friendly, with key terms + 1 example each.",
      },
      {
        side: "right",
        role: "Planner",
        accent: "emerald",
        title: "Plan",
        text:
          "Plan:\n• 1-sentence definition\n• 3 key terms: norms / roles / sanctions\n• 1 quick example each\n• 3 main agents: family, school, peers",
      },
      {
        side: "right",
        role: "Writer",
        accent: "purple",
        title: "Draft",
        text:
          "Socialization is how we learn a society’s expectations over time.\nNorms = shared rules; roles = expected behavior in positions; sanctions = rewards/punishments.\nExamples:\n• Norm: raising your hand\n• Role: student taking notes\n• Sanction: praise for participation",
      },
      {
        side: "right",
        role: "Reviewer",
        accent: "blue",
        title: "Tighten",
        text:
          "Make it more test-ready:\n1) Keep the definition crisp.\n2) Mention agents explicitly.\n3) End with a 10-second self-check question.",
      },
      {
        side: "right",
        role: "Final",
        accent: "blue",
        title: "Final",
        text:
          "✅ Study Summary\nSocialization is the lifelong process of learning norms and roles through social interaction.\nNorms guide behavior, roles define expectations, and sanctions reinforce them.\nKey agents: family, school, peers (plus media).\nQuick check: Can you name 1 norm, 1 role, and 1 sanction from today?",
      },
    ],
    []
  );

  const { feed, current, typing } = useLoopingDemo(demoSteps, 850);

  // 右侧滚动容器：每次新增/打字推进，保持滚动到底部
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feed, typing]);

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* 背景：克制高级 */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[28rem] h-[28rem] bg-blue-500/12 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 -right-10 w-[34rem] h-[34rem] bg-purple-500/12 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute inset-0 noise-mask" />

      {/* Header */}
      <header className="relative z-10 px-6 pt-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NeuroOrb />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                NeuroDesk
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {isZh ? "多模型学习工作台" : "Multi-model study workspace"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
              <span className="text-slate-300 mr-1">🌐</span>
              <button
                onClick={() => setLang("en")}
                className={cn(
                  "px-2 py-0.5 rounded-full transition",
                  lang === "en"
                    ? "bg-slate-100 text-slate-900 text-[11px] font-medium"
                    : "text-slate-300 hover:text-white"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                className={cn(
                  "px-2 py-0.5 rounded-full transition",
                  lang === "zh"
                    ? "bg-slate-100 text-slate-900 text-[11px] font-medium"
                    : "text-slate-300 hover:text-white"
                )}
              >
                中
              </button>
            </div>

            <Link
              href="/chat"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-900 text-xs font-medium shadow-md shadow-slate-900/40 hover:brightness-110 transition"
            >
              <span>{isZh ? "打开工作台" : "Open Workspace"}</span>
              <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Left */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] mb-5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-200">
                {isZh ? "免费 · AI 笔记 · AI Detector" : "Free · AI Notes · AI Detector"}
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.08]">
              <span className="ai-title">
                {isZh ? "NeuroDesk：更像团队的 AI" : "NeuroDesk, AI that works like a team"}
              </span>
              <span className="block mt-3 text-slate-200 text-xl sm:text-2xl font-semibold">
                {isZh
                  ? "把学习任务拆开，让不同 AI 各司其职"
                  : "Split study tasks — planner, writer, reviewer — in one workspace."}
              </span>
            </h1>

            <p className="mt-6 text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              {isZh ? (
                <>
                  NeuroDesk 把多模型协作做成“可用的流程”：笔记总结、检测写作痕迹、
                  学习任务拆解与复习清单。
                  <br />
                  不需要你会提示词，直接像发消息一样描述需求。
                </>
              ) : (
                <>
                  NeuroDesk turns multi-model orchestration into a practical workflow:
                  notes summarization, AI detection, task breakdown, and review checklists.
                  <br />
                  No prompt-crafting needed — just describe what you want.
                </>
              )}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/chat"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 hover:scale-[1.03] transition transform text-sm font-medium text-white text-center"
              >
                {isZh ? "开始使用（团队模式）" : "Start (Team Mode)"}
              </Link>

              <a
                href="#use-cases"
                className="px-6 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm text-slate-100 text-center transition"
              >
                {isZh ? "看看适合做什么" : "See use cases"}
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-2 justify-center lg:justify-start text-[11px] text-slate-300">
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                ✨ {isZh ? "轻量动效 · 不花哨" : "Subtle motion · not flashy"}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                🧾 {isZh ? "一键生成复习清单" : "One-click review checklist"}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                🛡️ {isZh ? "写作检测器" : "AI Detector"}
              </span>
            </div>
          </div>

          {/* Right: 固定高度对话框 + 内部滚动条 */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-lg">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-blue-500/10 via-cyan-500/5 to-purple-500/10 blur-2xl" />

              <div className="relative rounded-3xl border border-white/10 bg-slate-900/55 backdrop-blur-xl p-5 shadow-2xl">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isZh ? "实时协作演示" : "Live collaboration demo"}</span>
                  </div>
                  <span className="text-slate-400">{isZh ? "自动循环" : "Auto-loop"}</span>
                </div>

                {/* 固定高度的滚动区域 */}
                <div
                  ref={scrollRef}
                  className="mt-4 h-[380px] overflow-y-auto pr-2 rounded-2xl chat-scroll"
                >
                  <div className="space-y-3">
                    {/* 已完成 feed */}
                    {feed.map((s, i) => (
                      <ChatBubble
                        key={`${s.role}-${i}`}
                        side={s.side}
                        role={s.role}
                        accent={s.accent}
                        title={s.title}
                        text={s.text}
                      />
                    ))}

                    {/* 当前正在打字的一条（不加入 feed，避免无限增长） */}
                    <ChatBubble
                      side={current.side}
                      role={current.role}
                      accent={current.accent}
                      title={current.title}
                      text={typing}
                      isTyping
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400">
                    {isZh ? "提示：此处为演示动画" : "Tip: this is a scripted demo"}
                  </div>
                  <Link
                    href="/chat"
                    className="text-[11px] font-semibold text-slate-100 hover:text-white underline underline-offset-4 decoration-white/30"
                  >
                    {isZh ? "去真实体验 →" : "Try the real thing →"}
                  </Link>
                </div>
              </div>

              {/* 轻浮动标签 */}
              <div className="hidden sm:block">
                <div className="absolute -top-3 -left-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-200 float-soft">
                  Planner
                </div>
                <div className="absolute -bottom-3 right-8 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-200 float-soft2">
                  Writer
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases（加小表情更生动） */}
      <section id="use-cases" className="py-18 px-6 border-t border-white/5 bg-slate-950/95">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                {isZh ? "用 NeuroDesk 做什么？" : "What can you do with NeuroDesk?"}
              </h2>
              <p className="mt-2 text-slate-400 text-sm max-w-2xl">
                {isZh
                  ? "更像学习工作流，不是“一个聊天框”。选一个场景直接开始。"
                  : "A study workflow — not just a chat box. Pick a scenario and start."}
              </p>
            </div>

            <Link
              href="/account"
              className="text-[12px] text-slate-300 hover:text-white underline underline-offset-4 decoration-white/20"
            >
              {isZh ? "查看套餐与额度 →" : "View plans & limits →"}
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/7 hover:border-white/15 transition">
              <div className="text-sm font-semibold text-slate-100">📝 AI Notes</div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                {isZh
                  ? "把课堂笔记/长文变成可背诵的摘要 + 复习清单。"
                  : "Turn long notes into a clean summary + a review checklist."}
              </p>
              <div className="mt-4 text-[11px] text-slate-400">
                {isZh ? "适合：考试复习、读书笔记" : "Best for: exams, reading notes"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/7 hover:border-white/15 transition">
              <div className="text-sm font-semibold text-slate-100">🛡️ AI Detector</div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                {isZh
                  ? "给出可疑句子与风险提示，帮助你把写作改得更自然。"
                  : "Highlight suspicious lines and help you revise to sound natural."}
              </p>
              <div className="mt-4 text-[11px] text-slate-400">
                {isZh ? "适合：Essay、报告、作业" : "Best for: essays, reports"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/7 hover:border-white/15 transition">
              <div className="text-sm font-semibold text-slate-100">🤝 Team Mode</div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                {isZh
                  ? "规划/写作/审稿分工，让输出更稳、更像人。"
                  : "Planner + writer + reviewer roles for more reliable output."}
              </p>
              <div className="mt-4 text-[11px] text-slate-400">
                {isZh ? "适合：复杂作业、项目" : "Best for: complex tasks"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-18 px-6 bg-slate-950 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-white">
            {isZh ? "体验更像工具，而不是噱头" : "Feels like a tool, not a gimmick"}
          </h2>
          <p className="text-center text-slate-400 mt-3 text-sm">
            {isZh ? "轻动效 + 清晰层级 + 低学习成本。" : "Subtle motion, clear hierarchy, low learning curve."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm font-semibold text-white">{isZh ? "专注可读性" : "Readable by default"}</div>
              <p className="mt-2 text-sm text-slate-300">
                {isZh ? "信息密度高，但排版不压迫。默认适合长文本。" : "High signal, low stress. Built for long text."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm font-semibold text-white">{isZh ? "步骤化输出" : "Step-based output"}</div>
              <p className="mt-2 text-sm text-slate-300">
                {isZh ? "先规划、再写作、再审稿，减少跑题与不稳。" : "Plan → draft → review to reduce drift and instability."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm font-semibold text-white">{isZh ? "免费可用" : "Free to start"}</div>
              <p className="mt-2 text-sm text-slate-300">
                {isZh ? "先用起来，再决定要不要升级。" : "Try it first. Upgrade only if it truly helps."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-18 px-6 bg-slate-950 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            {isZh ? "把学习任务交给“团队”处理" : "Let the team handle the busywork"}
          </h2>
          <p className="mt-4 text-slate-300 text-sm sm:text-base">
            {isZh
              ? "打开工作台，像发消息一样描述需求；你只负责决定要不要用。"
              : "Open the workspace, describe your goal like a message, and decide what to keep."}
          </p>

          <Link
            href="/chat"
            className="inline-block mt-7 px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 hover:scale-[1.03] transition text-sm font-medium"
          >
            {isZh ? "进入 NeuroDesk →" : "Enter NeuroDesk →"}
          </Link>

          <div className="mt-4 text-[11px] text-slate-500">
            {isZh ? "套餐与额度：在 Account 页面查看。" : "Plans & limits: available on the Account page."}
          </div>
        </div>
      </section>

      <footer className="py-7 text-center text-slate-500 text-xs bg-slate-950 border-t border-white/5">
        © {new Date().getFullYear()} NeuroDesk · Made by vins
      </footer>

      {/* Global styles */}
      <style jsx global>{`
        .noise-mask {
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 18px 18px;
          opacity: 0.05;
          mix-blend-mode: overlay;
        }

        .ai-title {
          display: inline-block;
          background: linear-gradient(90deg, #60a5fa, #a78bfa, #34d399);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: titleFlow 6s ease-in-out infinite, titleWobble 4.2s ease-in-out infinite;
          will-change: transform, background-position;
        }

        @keyframes titleFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes titleWobble {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -1px, 0); }
        }

        /* Orb */
        .orb-spin {
          background: conic-gradient(
            from 180deg,
            rgba(96, 165, 250, 0.9),
            rgba(167, 139, 250, 0.9),
            rgba(52, 211, 153, 0.9),
            rgba(96, 165, 250, 0.9)
          );
          animation: orbHue 5.5s linear infinite;
        }

        .orb-glow {
          background: radial-gradient(
            circle at 30% 30%,
            rgba(96, 165, 250, 0.45),
            rgba(167, 139, 250, 0.25),
            rgba(0, 0, 0, 0) 70%
          );
          filter: blur(10px);
          opacity: 0.9;
        }

        .orb-jitter {
          animation: orbJitter 3.2s ease-in-out infinite;
          will-change: transform, filter;
        }

        @keyframes orbHue {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }

        @keyframes orbJitter {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          25% { transform: translate3d(0.6px, -0.4px, 0) rotate(0.3deg); }
          50% { transform: translate3d(-0.5px, 0.4px, 0) rotate(-0.2deg); }
          75% { transform: translate3d(0.4px, 0.5px, 0) rotate(0.2deg); }
        }

        .float-soft { animation: floatSoft 5.6s ease-in-out infinite; }
        .float-soft2 { animation: floatSoft 6.4s ease-in-out infinite reverse; }
        @keyframes floatSoft {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -6px, 0); }
        }

        /* 黑色融合滚动条（Chrome/Edge/Safari） */
        .chat-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .chat-scroll::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.35);
          border-radius: 999px;
        }
        .chat-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(96,165,250,0.5), rgba(167,139,250,0.45));
          border-radius: 999px;
          border: 2px solid rgba(0, 0, 0, 0.35);
        }
        .chat-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(96,165,250,0.65), rgba(167,139,250,0.6));
        }

        /* Firefox */
        .chat-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(167,139,250,0.55) rgba(0,0,0,0.35);
        }

        /* 让气泡更“像聊天”，而不是代码块 */
        .chat-bubble {
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        }
      `}</style>
    </main>
  );
}
