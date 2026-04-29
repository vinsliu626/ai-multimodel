"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Lang = "en" | "zh";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * 省资源打字机（更稳）：
 * - requestAnimationFrame 跟随刷新率
 * - 每帧追加多个字符，降低 React 更新次数
 */
function useTypewriterRaf(text: string, charsPerFrame = 3) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  const textRef = useRef(text);
  const iRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    textRef.current = text;
    iRef.current = 0;
    setOut("");
    setDone(false);

    const tick = () => {
      const t = textRef.current;
      const nextI = Math.min(t.length, iRef.current + charsPerFrame);
      iRef.current = nextI;

      // 只有变化才 set
      setOut(t.slice(0, nextI));

      if (nextI >= t.length) {
        setDone(true);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [text, charsPerFrame]);

  return { out, done };
}

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

  const isYou = current.role === "You";
  const { out, done } = useTypewriterRaf(current.text, isYou ? 4 : 3);

  const [feed, setFeed] = useState<DemoStep[]>([]);

  useEffect(() => {
    setFeed([]);
    setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!done) return;

    const t = setTimeout(() => {
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
      ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.7)]"
      : accent === "emerald"
        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
        : accent === "purple"
          ? "bg-purple-400 shadow-[0_0_8px_rgba(167,139,250,0.7)]"
          : "bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.6)]";
  return <span className={cn("inline-block w-1.5 h-1.5 rounded-full", cls)} />;
}

const ChatBubble = React.memo(function ChatBubble({
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
      ? "bg-gradient-to-br from-blue-900/35 via-purple-900/18 to-emerald-900/18"
      : role === "You"
        ? "bg-white/[0.04]"
        : "bg-black/40";

  const border =
    role === "Final"
      ? "border-blue-500/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
      : "border-white/6";

  const nameColor =
    accent === "blue"
      ? "text-blue-300"
      : accent === "emerald"
        ? "text-emerald-300"
        : accent === "purple"
          ? "text-purple-300"
          : "text-slate-300";

  return (
    <div className={cn("flex w-full", isLeft ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "relative max-w-[88%] rounded-2xl border px-4 py-3 backdrop-blur-md transition-all duration-200",
          baseBg,
          border,
          "chat-bubble"
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <AccentDot accent={accent} />
            <span className={cn("font-bold", nameColor)}>{role}</span>
            {title && <span className="tracking-normal text-slate-500 capitalize">/ {title}</span>}
          </div>

          {isTyping && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
              generating
            </span>
          )}
        </div>

        <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-light text-slate-200">
          {text}
          {isTyping && (
            <span className="ml-1 inline-block h-3 w-1.5 align-middle bg-emerald-400/80 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          )}
        </div>
      </div>
    </div>
  );
});

function NeuroOrb() {
  return (
    <div className="relative h-10 w-10">
      <div className="absolute inset-0 rounded-2xl orb-spin orb-jitter opacity-80" />
      <div className="absolute inset-0 rounded-2xl orb-glow" />
      <div className="absolute inset-[1px] rounded-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-gradient-to-b from-white to-white/40 bg-clip-text text-[14px] font-black tracking-tight text-transparent">
          N
        </span>
      </div>
    </div>
  );
}

function ChatDemo({ isZh, steps }: { isZh: boolean; steps: DemoStep[] }) {
  const { feed, current, typing } = useLoopingDemo(steps, 850);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (!nearBottom) return;

    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [feed, typing]);

  return (
    <div className="relative w-full max-w-[520px]">
      <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-tr from-blue-500/18 via-cyan-500/10 to-purple-500/18 blur-lg opacity-50" />

      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505]/80 p-6 shadow-[0_0_40px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500/50" />
              <span className="h-2 w-2 rounded-full bg-yellow-500/50" />
              <span className="h-2 w-2 rounded-full bg-green-500/50" />
            </span>
            <span className="ml-2 border-l border-white/10 pl-2 tracking-wider">
              {isZh ? "终端演示" : "TERMINAL_DEMO"}
            </span>
          </div>
          <div className="rounded border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-blue-400">
            {isZh ? "自动执行" : "AUTO-EXEC"}
          </div>
        </div>

        {/* 注意：这里不再加 scroll-smooth（它会让连续 scroll 更贵） */}
        <div ref={scrollRef} className="chat-scroll h-[400px] overflow-y-auto pr-3">
          <div className="space-y-4">
            {feed.map((s, i) => (
              <ChatBubble key={`${s.role}-${i}-${s.title ?? ""}`} side={s.side} role={s.role} accent={s.accent} title={s.title} text={s.text} />
            ))}
            <ChatBubble side={current.side} role={current.role} accent={current.accent} title={current.title} text={typing} isTyping />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 font-mono text-xs text-slate-500">
            {isZh ? "等待指令..." : "Awaiting input..."}
          </div>
        </div>
      </div>

      <div className="float-soft2 absolute -right-6 -bottom-6 z-20 hidden items-center gap-2 rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 shadow-xl shadow-purple-900/20 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
        Writer Node Active
      </div>
    </div>
  );
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const isZh = lang === "zh";

  const demoSteps: DemoStep[] = useMemo(
    () => [
      {
        side: "right",
        role: "You",
        accent: "slate",
        title: "Request",
        text: "Summarize this lecture note about socialization.\nKeep it short and study-friendly, with key terms + 1 example each.",
      },
      { side: "left", role: "Planner", accent: "emerald", title: "Plan", text: "Plan:\n• 1-sentence definition\n• 3 key terms: norms / roles / sanctions\n• 1 quick example each\n• 3 main agents: family, school, peers" },
      { side: "left", role: "Writer", accent: "purple", title: "Draft", text: "Socialization is how we learn a society’s expectations over time.\nNorms = shared rules; roles = expected behavior in positions; sanctions = rewards/punishments.\nExamples:\n• Norm: raising your hand\n• Role: student taking notes\n• Sanction: praise for participation" },
      { side: "left", role: "Reviewer", accent: "blue", title: "Tighten", text: "Make it more test-ready:\n1) Keep the definition crisp.\n2) Mention agents explicitly.\n3) End with a 10-second self-check question." },
      { side: "left", role: "Final", accent: "blue", title: "Final Output", text: "✅ Study Summary\nSocialization is the lifelong process of learning norms and roles through social interaction.\nNorms guide behavior, roles define expectations, and sanctions reinforce them.\nKey agents: family, school, peers (plus media).\nQuick check: Can you name 1 norm, 1 role, and 1 sanction from today?" },
    ],
    []
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] font-sans text-white selection:bg-blue-500/30 selection:text-blue-200">
      {/* ✅ 保留你想要的网格，但它是静态的，OK */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:34px_34px] opacity-60" />

      {/* ✅ scanlines：改成“静态纹理 + 超低频轻位移”(不会每帧重绘) */}
      <div className="scanlines pointer-events-none absolute inset-0 z-0 opacity-45" />

      {/* ✅ noise：改成轻量点阵 noise（不要 feTurbulence！） */}
      <div className="noise-lite pointer-events-none absolute inset-0 z-0" />

      {/* 柔光（保留你风格，但 blur 控制） */}
      <div className="pointer-events-none absolute top-[-10rem] left-1/4 h-[40rem] w-[40rem] rounded-full bg-blue-600/10 blur-[90px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[50rem] w-[50rem] rounded-full bg-purple-600/10 blur-[110px]" />

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#030303]/60 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="group flex cursor-pointer items-center gap-3">
            <NeuroOrb />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 transition-colors group-hover:text-slate-300">
                NexusDesk
              </p>
              <p className="text-sm font-semibold text-slate-200">{isZh ? "多模型协作矩阵" : "Multi-Agent Matrix"}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-full border border-white/5 bg-white/[0.02] p-1 shadow-inner">
              <button
                onClick={() => setLang("en")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-all duration-200",
                  lang === "en" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-all duration-200",
                  lang === "zh" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                中
              </button>
            </div>

            <Link
              href="/chat"
              className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold tracking-wide text-black transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.25)] sm:inline-flex"
            >
              <span>{isZh ? "启动终端" : "Launch Terminal"}</span>
              <span aria-hidden className="text-slate-500">↗</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex min-h-[90vh] items-center px-6 pt-40 pb-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-12">
          <div className="text-center lg:col-span-6 lg:text-left">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 font-mono text-[11px] tracking-wider text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.12)]">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              {isZh ? "系统版本 v2.4 在线" : "SYSTEM v2.4 ONLINE"}
            </div>

            <h1 className="mb-6 text-5xl leading-[1.05] font-extrabold tracking-tighter sm:text-6xl lg:text-[4.8rem]">
              <span className="block text-white">{isZh ? "AI 不该是孤岛" : "AI shouldn't work"}</span>
              <span className="ai-title pb-2">{isZh ? "让它们组队为你工作" : "in isolation."}</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed font-light text-slate-400 lg:mx-0 sm:text-lg">
              {isZh ? (
                <>
                  NexusDesk 重构了人机交互。我们用 <strong className="font-medium text-slate-200">规划器、撰写者与审核员</strong>{" "}
                  组成的 AI 矩阵，将复杂的学习与分析任务拆解。你无需再绞尽脑汁编写提示词，只需下达指令。
                </>
              ) : (
                <>
                  NexusDesk redesigns human-AI interaction. We use a matrix of{" "}
                  <strong className="font-medium text-slate-200">planners, writers, and reviewers</strong> to decompose complex
                  study and writing tasks across AI Note, AI Detector, AI Humanizer, AI Study, and Workflow. Stop crafting
                  perfect prompts, just issue commands.
                </>
              )}
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
              <Link
                href="/chat"
                className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-white px-8 py-4 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
              >
                <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
                {isZh ? "初始化工作流" : "Initialize Workflow"}
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>

              <a
                href="#use-cases"
                className="rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-4 text-center text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05]"
              >
                {isZh ? "浏览架构特性" : "Explore Architecture"}
              </a>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {["AI Note", "AI Detector", "AI Humanizer", "AI Study", "Workflow"].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center lg:col-span-6 lg:justify-end">
            <div className="float-soft absolute top-10 left-[-4rem] z-20 hidden flex-col gap-3 rounded-2xl border border-white/10 bg-black/60 p-4 shadow-2xl backdrop-blur-lg md:flex">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">Telemetry</div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">System Nominal</div>
                  <div className="mt-0.5 font-mono text-[10px] text-emerald-400">Latency: 12ms</div>
                </div>
              </div>
              <div className="my-1 h-[1px] w-full bg-gradient-to-r from-white/10 to-transparent" />
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                <span>Active Nodes:</span>
                <span className="text-white">4/4</span>
              </div>
            </div>

            <ChatDemo isZh={isZh} steps={demoSteps} />
          </div>
        </div>
      </section>

      {/* 下面模块保持你原来样式（略） */}
      <section id="use-cases" className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{isZh ? "矩阵核心能力" : "Matrix Capabilities"}</h2>
            <p className="mt-3 max-w-xl text-sm font-light text-slate-400">
              {isZh
                ? "抛弃单薄的对话框，用工程化的思维管理输出。每个模块都经过专门微调以应对特定场景。"
                : "Ditch the flat chatbox. Manage output with engineering mindset across note generation, detection, rewriting, study prep, and multi-agent workflows."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
            <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors hover:bg-white/[0.02]">
              <div className="absolute top-0 right-0 p-8 opacity-10 transition-opacity group-hover:opacity-20">
                <svg className="h-24 w-24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                </svg>
              </div>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <span className="text-xl">📝</span>
              </div>
              <h3 className="mb-3 text-lg font-semibold tracking-wide text-white">AI Notes</h3>
              <p className="mb-6 text-sm leading-relaxed font-light text-slate-400">
                {isZh ? "输入冗长的文献或录音稿，矩阵会自动剥离冗余，重组为结构化笔记与自测清单。" : "Feed lengthy papers or transcripts. The matrix strips bloat and rebuilds structured notes and self-test checklists."}
              </p>
              <div className="font-mono text-xs text-blue-400"># READ_COMPREHENSION</div>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors hover:bg-white/[0.02]">
              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 shadow-[0_0_15px_rgba(167,139,250,0.1)]">
                <span className="text-xl">🛡️</span>
              </div>
              <h3 className="mb-3 text-lg font-semibold tracking-wide text-white">AI Detector</h3>
              <p className="mb-6 text-sm leading-relaxed font-light text-slate-400">
                {isZh ? "逐句扫描文本指纹，标注高风险的机器生成痕迹，并提供拟人化改写建议。" : "Line-by-line text fingerprint scanning. Highlights high-risk machine footprints and suggests humanized revisions."}
              </p>
              <div className="font-mono text-xs text-purple-400"># RISK_ANALYSIS</div>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors hover:bg-white/[0.02]">
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 shadow-[0_0_15px_rgba(34,211,238,0.08)]">
                <span className="text-xl">✍</span>
              </div>
              <h3 className="mb-3 text-lg font-semibold tracking-wide text-white">AI Humanizer</h3>
              <p className="mb-6 text-sm leading-relaxed font-light text-slate-400">
                {isZh
                  ? "在保留原意的前提下，让语气、节奏和句式更自然、更像真人写作。"
                  : "Refine wording, rhythm, and phrasing so text feels more natural without changing the original meaning."}
              </p>
              <div className="font-mono text-xs text-cyan-400"># TONE_REFINEMENT</div>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors hover:bg-white/[0.02]">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
                <span className="text-xl">▣</span>
              </div>
              <h3 className="mb-3 text-lg font-semibold tracking-wide text-white">AI Study</h3>
              <p className="mb-6 text-sm leading-relaxed font-light text-slate-400">
                {isZh
                  ? "从文档中提取内容，生成 notes、flashcards 和 quiz，把材料直接变成可复习的学习单元。"
                  : "Extract from documents and turn source material into notes, flashcards, and quiz sets for actual study sessions."}
              </p>
              <div className="font-mono text-xs text-amber-400"># STUDY_PIPELINE</div>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors hover:bg-white/[0.02]">
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
                <span className="text-xl">🤝</span>
              </div>
              <h3 className="mb-3 text-lg font-semibold tracking-wide text-white">Team Mode</h3>
              <p className="mb-6 text-sm leading-relaxed font-light text-slate-400">
                {isZh ? "召唤多角色工作流：大纲规划师主导逻辑，文案撰写者填充细节，严苛审核员把关质量。" : "Summon a multi-role workflow: Planners lead logic, Writers fill details, strict Reviewers enforce quality."}
              </p>
              <div className="font-mono text-xs text-emerald-400"># SYNERGY_PROTOCOL</div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-extrabold tracking-tighter text-white sm:text-5xl">{isZh ? "准备好接入矩阵了吗？" : "Ready to access the Matrix?"}</h2>
          <p className="mb-10 text-lg font-light text-slate-400">{isZh ? "极简界面之下，是强大的工程化底座。马上开启高效协作。" : "Beneath the minimal interface lies a powerful engineering foundation."}</p>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-sm font-bold tracking-wide text-black transition-all duration-200 hover:scale-105 hover:shadow-[0_0_28px_rgba(255,255,255,0.35)]"
          >
            {isZh ? "启动工作台 →" : "Launch Workspace →"}
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 bg-[#030303] py-8 text-center">
        <div className="mb-4 flex items-center justify-center gap-4 text-xs uppercase tracking-[0.18em] text-slate-500">
          <Link href="/blog" className="transition hover:text-slate-300">
            Blog
          </Link>
          <Link href="/privacy" className="transition hover:text-slate-300">
            Privacy
          </Link>
        </div>
        <p className="font-mono text-xs tracking-wider text-slate-600">© {new Date().getFullYear()} NEXUSDESK SYSTEM // VINS.ENGINEERING</p>
      </footer>

      <style jsx global>{`
        /* ✅ 轻量噪声：不用 turbulence！ */
        .noise-lite {
          background-image:
            radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 22px 22px, 36px 36px;
          background-position: 0 0, 8px 12px;
          opacity: 0.35;
          mix-blend-mode: overlay;
          transform: translateZ(0);
          will-change: opacity;
        }

        /* ✅ scanlines：默认静态；只做超低频轻微位移（不会每帧） */
        .scanlines {
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.012),
            rgba(255, 255, 255, 0.012) 1px,
            transparent 3px
          );
          background-size: 100% 6px;
          opacity: 0.6;
          animation: scanSlow 14s steps(14) infinite;
          transform: translateZ(0);
          will-change: background-position;
        }
        @keyframes scanSlow {
          0% { background-position: 0 0; }
          100% { background-position: 0 84px; }
        }

        .ai-title {
          display: inline-block;
          background: linear-gradient(to right, #ffffff, #a5b4fc, #6ee7b7, #ffffff);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: titleFlow 7s ease-in-out infinite, titleWobble 4.6s ease-in-out infinite;
          will-change: background-position, transform;
        }
        @keyframes titleFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes titleWobble {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }

        .orb-spin {
          background: conic-gradient(from 180deg, #3b82f6, #8b5cf6, #10b981, #3b82f6);
          animation: orbHue 10s linear infinite, spin 12s linear infinite;
          will-change: transform, filter;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes orbHue { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }

        .orb-glow {
          background: radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.55), transparent 70%);
          filter: blur(12px);
          animation: pulseGlow 5.5s ease-in-out infinite;
          will-change: transform, opacity;
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.08); }
        }

        .orb-jitter {
          animation: orbJitter 5.8s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes orbJitter {
          0%, 100% { transform: translate3d(0, 0, 0); }
          25% { transform: translate3d(0.6px, -0.6px, 0); }
          75% { transform: translate3d(-0.6px, 0.6px, 0); }
        }

        .float-soft { animation: floatSoft 7s ease-in-out infinite; will-change: transform; }
        .float-soft2 { animation: floatSoft 8s ease-in-out infinite reverse; will-change: transform; }
        @keyframes floatSoft {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        .chat-scroll::-webkit-scrollbar { width: 6px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 10px; }
        .chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
        .chat-scroll { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.12) transparent; }

        @media (prefers-reduced-motion: reduce) {
          .scanlines, .orb-spin, .orb-jitter, .ai-title, .float-soft, .float-soft2, .orb-glow { animation: none !important; }
          .noise-lite { opacity: 0.18; }
        }
      `}</style>
    </main>
  );
}
