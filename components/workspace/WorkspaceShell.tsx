"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import type { PillOption } from "@/components/workspace/ui/PillSelect";
import { PillSelect } from "@/components/workspace/ui/PillSelect";

import { PlanPillStyles, PlanPillButton } from "@/components/workspace/ui/PlanPill";
import { PlanModal } from "@/components/workspace/ui/PlanModal";
import { RedeemModal } from "@/components/workspace/ui/RedeemModal";
import { SettingsModal } from "@/components/workspace/ui/SettingsModal";

import { DetectorUI } from "@/components/workspace/detector/DetectorUI";
import { NoteUI } from "@/components/workspace/note/NoteUI";
import { AiFormattedText } from "@/components/shared/AiFormattedText";

/** ===================== Types ===================== */
type Role = "user" | "assistant";
type Message = { role: Role; content: string };

type Mode = "single" | "team" | "detector" | "note";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";
type Lang = "zh" | "en";

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** ===================== Billing / Entitlement ===================== */
export type PlanId = "basic" | "pro" | "ultra" | "gift";

export type Entitlement = {
  ok: true;
  plan: PlanId;
  unlimited: boolean;

  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;

  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedChatCountToday: number;

  canSeeSuspiciousSentences: boolean;
};

function useEntitlement(sessionExists: boolean) {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [loadingEnt, setLoadingEnt] = useState(false);

  async function refresh() {
    if (!sessionExists) {
      setEnt(null);
      return;
    }
    setLoadingEnt(true);
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setEnt(data as Entitlement);
    } finally {
      setLoadingEnt(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExists]);

  return { ent, loadingEnt, refresh, setEnt };
}

/** ===================== Main ===================== */
export function WorkspaceShell() {
  const { data: session, status } = useSession();
  const sessionExists = !!session;
  const searchParams = useSearchParams();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [lang, setLang] = useState<Lang>("en");
  const isZh = lang === "zh";
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [mode, setMode] = useState<Mode>("single");
  const [modelKind, setModelKind] = useState<ModelKind>("fast");
  const [singleModelKey, setSingleModelKey] = useState<SingleModelKey>("groq_fast");

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Billing UI
  const [planOpen, setPlanOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const { ent, refresh: refreshEnt } = useEntitlement(sessionExists);

  const detectorLocked = !sessionExists;
  const noteLocked = !sessionExists;

  // Stripe redirect feedback
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "1" || canceled === "1") {
      refreshEnt();
      setPlanOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // esc close sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ===== Settings persistence =====
  useEffect(() => {
    try {
      const savedLang = (localStorage.getItem("lang") as Lang) || "en";
      const savedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
      setLang(savedLang);
      setTheme(savedTheme);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  async function loadSessions() {
    if (!sessionExists) {
      setSessions([]);
      return;
    }
    try {
      setSessionsLoading(true);
      const res = await fetch("/api/chat/sessions");
      const data = await res.json().catch(() => ({}));
      setSessions(data.sessions ?? []);
    } catch (err) {
      console.error("loadSessions failed:", err);
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExists]);

  async function handleSelectSession(sessionId: string) {
    if (!sessionExists) return;
    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/chat/session/${sessionId}`);
      const data = await res.json().catch(() => ({}));

      const msgs: Message[] = (data.messages ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      setMessages(msgs);
      setChatSessionId(sessionId);
      setSidebarOpen(false);

      // 切到历史会话，就回到聊天模式
      if (mode === "detector" || mode === "note") setMode("single");
    } catch (err) {
      console.error("load session messages failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewChat() {
    if (isLoading) return;
    setMessages([]);
    setInput("");
    setChatSessionId(null);
    setSidebarOpen(false);
    if (mode === "detector" || mode === "note") setMode("single");
  }

  async function handleSend() {
    if (mode === "detector" || mode === "note") return;
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const userMessage: Message = { role: "user", content: userText };
    const historyForApi = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          mode,
          model: modelKind,
          singleModelKey,
          chatSessionId,
        }),
      });

      // ✅ 如果超额（429）弹套餐
      if (res.status === 429) {
        setPlanOpen(true);
        throw new Error(isZh ? "额度不足" : "Quota exceeded");
      }

      const data = await res.json().catch(() => ({}));
      const fullReply: string = data.reply ?? (isZh ? "AI 暂时没有返回内容。" : "No response from AI.");

      if (sessionExists && data.chatSessionId) {
        setChatSessionId(data.chatSessionId);
        loadSessions();
      }

      if (sessionExists) refreshEnt();

      // typing effect
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
            if (next[lastIndex].role === "assistant") next[lastIndex] = { ...next[lastIndex], content: slice };
            return next;
          });
          if (i >= fullReply.length) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
    } catch (err: any) {
      console.error("/api/chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            (isZh ? "调用后端出错了，请稍后重试。\n\n错误信息：" : "Backend error, please try again later.\n\nError: ") +
            (err instanceof Error ? err.message : String(err)),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mode === "detector" || mode === "note") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const modeOptions: PillOption[] = [
    { value: "single", label: isZh ? "单模型" : "Single model" },
    { value: "team", label: isZh ? "团队协作" : "Team / multi-agent" },
    { value: "detector", label: isZh ? "AI 检测器" : "AI Detector" },
    { value: "note", label: isZh ? "AI 笔记" : "AI Note" },
  ];

  const singleModelOptions: PillOption[] = [
    { value: "groq_fast", label: `Groq · ${isZh ? "快速" : "Fast"}` },
    { value: "groq_quality", label: `Groq · ${isZh ? "高质量" : "Pro"}` },
    { value: "hf_deepseek", label: "DeepSeek" },
    { value: "hf_kimi", label: "Kimi" },
  ];

  const teamQualityOptions: PillOption[] = [
    { value: "fast", label: isZh ? "快速" : "Fast" },
    { value: "quality", label: isZh ? "高质量" : "High quality" },
  ];

  const userInitial = session?.user?.name?.[0] || session?.user?.email?.[0] || "U";

  async function redeemCode(code: string) {
    setRedeemError(null);
    if (!code) return;
    setRedeemLoading(true);
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `Redeem error: ${res.status}`);
      setRedeemOpen(false);
      await refreshEnt();
    } catch (e: any) {
      setRedeemError(e?.message || (isZh ? "兑换失败" : "Redeem failed"));
    } finally {
      setRedeemLoading(false);
    }
  }

  async function manageBilling(plan: "pro" | "ultra") {
    try {
      const billingRoute = ent?.plan === plan ? "/api/billing/portal" : "/api/billing/checkout";
      const res = await fetch(billingRoute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(billingRoute === "/api/billing/checkout" ? { body: JSON.stringify({ plan }) } : {}),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        alert(`Checkout API failed (${res.status})\n` + (data?.error ? `error: ${data.error}\n` : "") + `raw: ${text}`);
        return;
      }
      if (!data?.url) {
        alert(`No checkout url returned.\nraw: ${text}`);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      alert(`Request error: ${e?.message || String(e)}`);
    }
  }

  return (
    <main
      className={[
        "h-screen w-screen overflow-hidden",
        theme === "dark"
          ? "bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100"
          : "bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900",
      ].join(" ")}
    >
      <PlanPillStyles />
      <div className="h-full w-full border border-white/10 bg-white/5 shadow-[0_18px_60px_rgba(15,23,42,0.8)] backdrop-blur-xl flex">
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" onClick={() => setSidebarOpen(false)} />}

        {/* Sidebar */}
        <aside
          className={[
            "fixed z-50 left-0 top-0 h-full w-[290px] md:w-72",
            "border-r border-white/10",
            "bg-gradient-to-b from-slate-950/90 via-slate-900/85 to-slate-950/90",
            "shadow-2xl shadow-black/40",
            "backdrop-blur-xl",
            "transform transition-transform duration-200 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between relative">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 animate-pulse shadow-lg shadow-blue-500/40" />
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-widest text-slate-400">Multi-Model</p>
                <p className="text-sm font-semibold text-slate-50">{isZh ? "AI 工作台" : "AI Workspace"}</p>
              </div>
            </div>

            <button
              onClick={() => setSettingsOpen(true)}
              className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center"
              title={isZh ? "设置" : "Settings"}
            >
              ⚙️
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-900/80 text-slate-100 border border-white/10 hover:border-blue-500/60 hover:bg-slate-900 shadow-sm transition-all duration-150"
              >
                {isZh ? "+ 新对话" : "+ New"}
              </button>

              <button
                onClick={() => setSidebarOpen(false)}
                className="h-8 w-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
                title={isZh ? "关闭" : "Close"}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ✅ 你之前修过的版本（带未登录提示） */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pr-1 pb-3 space-y-1 mt-1 custom-scrollbar">
            {!sessionExists && (
              <div className="px-3 py-3 text-xs text-slate-400">
                {isZh ? "未登录：不会保存历史会话。" : "Not signed in: conversations are not saved."}
              </div>
            )}

            {sessionExists && sessionsLoading && (
              <div className="px-3 py-2 text-xs text-slate-400">{isZh ? "正在加载历史会话…" : "Loading sessions…"}</div>
            )}

            {sessionExists && !sessionsLoading && sessions.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">
                {isZh ? (
                  <>
                    还没有保存的会话。<br />
                    开始一次新的对话试试吧 👆
                  </>
                ) : (
                  <>
                    No conversations yet.<br />
                    Start a new one 👆
                  </>
                )}
              </div>
            )}

            {sessionExists &&
              sessions.map((s) => {
                const isActive = s.id === chatSessionId;
                return (
                  <div
                    key={s.id}
                    className={[
                      "w-full flex items-center gap-1 px-2 py-1 rounded-2xl text-xs transition-all duration-150",
                      isActive
                        ? "bg-blue-500/20 border border-blue-400/70 text-slate-50 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]"
                        : "bg-slate-900/60 border border-white/5 text-slate-300 hover:border-blue-400/60 hover:bg-slate-900",
                    ].join(" ")}
                  >
                    <button onClick={() => handleSelectSession(s.id)} className="flex-1 text-left flex flex-col gap-0.5 px-1 py-1">
                      <span className="truncate font-medium text-[12px]">{s.title || (isZh ? "未命名会话" : "Untitled")}</span>
                      <span className="text-[10px] text-slate-500">{new Date(s.createdAt).toLocaleString()}</span>
                    </button>
                  </div>
                );
              })}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col bg-slate-950/60">
          <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-4 bg-slate-950/60">
            {/* Left */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="h-9 w-9 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center shadow-md shadow-blue-500/10"
                title={isZh ? "打开历史会话" : "Open history"}
              >
                <span className="text-slate-200 text-sm">☰</span>
              </button>

              <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-emerald-400 shadow-md shadow-blue-500/40" />
              <div className="flex flex-col gap-0.5">
                <h1 className="font-semibold text-sm text-slate-100">{isZh ? "多模型 AI 助手 · 工作台" : "Multi-Model AI Workspace"}</h1>
                <p className="text-[11px] text-slate-400">Groq · DeepSeek · Kimi · Multi-Agent</p>
              </div>
            </div>

            {/* Center: Plan pill */}
            <div className="hidden md:flex items-center justify-center flex-1">
              <PlanPillButton
                isZh={isZh}
                plan={ent?.plan ?? "basic"}
                unlimited={!!ent?.unlimited}
                onClick={() => {
                  refreshEnt();
                  setPlanOpen(true);
                }}
              />
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-2xl bg-slate-900/80 border border-white/10 shadow-sm">
                <div className="flex flex-col gap-1 text-[11px] min-w-[160px]">
                  <span className="text-slate-400">{isZh ? "运行模式" : "Mode"}</span>
                  <PillSelect
                    value={mode}
                    options={modeOptions}
                    onChange={(v) => {
                      const next = v as Mode;
                      if (!sessionExists && (next === "detector" || next === "note")) {
                        setPlanOpen(true);
                        return;
                      }
                      setMode(next);
                      if (next === "detector" || next === "note") setIsLoading(false);
                    }}
                    disabled={isLoading}
                  />
                </div>

                <div className="h-8 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

                <div className="flex flex-col gap-1 text-[11px] min-w-[180px]">
                  <span className="text-slate-400">
                    {mode === "single"
                      ? isZh
                        ? "单模型选择"
                        : "Model"
                      : mode === "team"
                      ? isZh
                        ? "团队质量"
                        : "Team quality"
                      : mode === "detector"
                      ? isZh
                        ? "检测语言"
                        : "Language"
                      : isZh
                      ? "笔记输入"
                      : "Input"}
                  </span>

                  {mode === "single" ? (
                    <PillSelect value={singleModelKey} options={singleModelOptions} onChange={(v) => setSingleModelKey(v as SingleModelKey)} disabled={isLoading} />
                  ) : mode === "team" ? (
                    <PillSelect value={modelKind} options={teamQualityOptions} onChange={(v) => setModelKind(v as ModelKind)} disabled={isLoading} />
                  ) : mode === "detector" ? (
                    <div className="w-full rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50">
                      English only
                    </div>
                  ) : (
                    <div className="w-full rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50">
                      {isZh ? "音频 / 录音 / 文本" : "Audio / Record / Text"}
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Plan button */}
              <button
                onClick={() => setPlanOpen(true)}
                className="md:hidden px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-100 hover:bg-white/10 transition"
              >
                {isZh ? "套餐" : "Plan"}
              </button>

              {/* Auth */}
              <div className="flex items-center gap-2">
                {status === "loading" ? (
                  <div className="h-8 w-8 rounded-full bg-slate-800 animate-pulse" />
                ) : session ? (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-xs font-semibold text-white shadow-md shadow-blue-500/40">
                      {String(userInitial).toUpperCase()}
                    </div>
                    <div className="hidden sm:flex flex-col text-[11px] leading-tight">
                      <span className="text-slate-100 truncate max-w-[120px]">{session.user?.name || session.user?.email}</span>
                      <button onClick={() => signOut()} className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline">
                        {isZh ? "退出登录" : "Sign out"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => signIn()}
                    className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-xs font-medium text-white shadow-md shadow-blue-500/40 hover:brightness-110 transition-all"
                  >
                    {isZh ? "登录 / 注册" : "Sign in / Sign up"}
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Body */}
          {mode === "detector" ? (
            <DetectorUI isLoadingGlobal={isLoading} isZh={isZh} locked={detectorLocked} canSeeSuspicious={!!ent?.canSeeSuspiciousSentences} />
          ) : mode === "note" ? (
            <NoteUI isLoadingGlobal={isLoading} isZh={isZh} locked={noteLocked} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3 custom-scrollbar">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap max-w-[80%] border backdrop-blur-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white border-blue-400/70 shadow-md shadow-blue-500/30"
                          : "bg-slate-900/80 text-slate-100 border-white/10"
                      }`}
                    >
                      {msg.role === "assistant" ? <AiFormattedText text={msg.content} className="text-sm leading-relaxed" /> : msg.content}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {mode === "team" ? (isZh ? "多模型团队正在协作思考中……" : "Multi-agent team is thinking…") : isZh ? "模型正在思考中……" : "Model is thinking…"}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 px-4 py-3 bg-slate-950/80">
                <div className="flex gap-2 items-end">
                  <textarea
                    className="flex-1 border border-white/10 rounded-2xl px-3 py-2 text-sm resize-none h-20 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-transparent"
                    placeholder={isZh ? "输入你的问题，按 Enter 发送，Shift+Enter 换行" : "Type your question, press Enter to send, Shift+Enter for new line"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="w-28 h-10 rounded-2xl bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-white text-sm font-medium shadow-md shadow-blue-500/40 disabled:from-slate-600 disabled:via-slate-700 disabled:to-slate-700 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-150 hover:brightness-110"
                  >
                    {isLoading ? (isZh ? "思考中..." : "Thinking...") : isZh ? "发送 →" : "Send →"}
                  </button>
                </div>

                {sessionExists && ent && !ent.unlimited && ent.plan === "basic" && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {isZh ? "Basic 今日聊天额度：" : "Basic chat quota today: "}
                    <span className="text-slate-300">
                      {ent.usedChatCountToday}/{ent.chatPerDay}
                    </span>
                    {" · "}
                    <button onClick={() => setPlanOpen(true)} className="underline underline-offset-4 hover:text-slate-300">
                      {isZh ? "升级解锁更多" : "Upgrade"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Plan modal */}
      <PlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        isZh={isZh}
        sessionExists={sessionExists}
        ent={ent}
        onOpenRedeem={() => {
          if (!sessionExists) return signIn();
          setRedeemError(null);
          setRedeemOpen(true);
        }}
        onManageBilling={manageBilling}
        refreshEnt={refreshEnt}
      />

      {/* Redeem modal */}
      <RedeemModal open={redeemOpen} onClose={() => setRedeemOpen(false)} isZh={isZh} onRedeem={redeemCode} loading={redeemLoading} error={redeemError} />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} isZh={isZh} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />
    </main>
  );
}
