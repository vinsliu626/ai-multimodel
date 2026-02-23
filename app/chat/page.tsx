"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";

// 组件（你现有）
import { PlanPillStyles, PlanPillButton } from "@/components/chat/billing/PlanPill";
import { PlanModal } from "@/components/chat/billing/PlanModal";
import { RedeemModal } from "@/components/chat/billing/RedeemModal";
import { SettingsModal } from "@/components/chat/settings/SettingsModal";
import { ChatHistoryRow } from "@/components/chat/sidebar/ChatHistoryRow";
import { DetectorUI } from "@/components/workspace/detector/DetectorUI";
import { NoteUI } from "@/components/workspace/note/NoteUI";

// workflow UI
import { Bubble } from "@/components/chat/ui/workflow/Bubble";
import { ModeDropdown } from "@/components/chat/ui/workflow/ModeDropdown";
import type { ChatMode, Lang, WorkflowMessage } from "@/components/chat/ui/workflow/types";
import { uid } from "@/components/chat/ui/workflow/types";
import { tryParseWorkflowReply } from "@/components/chat/ui/workflow/parseWorkflow";

/** ===================== Types ===================== */
type ChatSession = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type PlanId = "basic" | "pro" | "ultra" | "gift";
type Entitlement = {
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

/** ===================== helpers ===================== */
async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { text, data };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 60000, ...rest } = init;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFetchError(err: any, isZh: boolean) {
  if (err?.name === "AbortError") {
    return isZh ? "请求超时：后端可能卡住或正在重启。" : "Request timed out: backend may be stuck or restarting.";
  }
  const msg = String(err?.message || err || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    return isZh ? "网络请求失败：后端连接断开/崩溃/重启。" : "Network request failed: backend disconnected/crashed/restarting.";
  }
  return (isZh ? "请求失败：" : "Request failed: ") + msg;
}

/** ===================== Entitlement Hook ===================== */
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
      const res = await fetchWithTimeout("/api/billing/status", { cache: "no-store", timeoutMs: 15000 });
      const { data } = await safeReadJson(res);
      if (res.ok && data?.ok) setEnt(data as Entitlement);
    } catch {
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

/** ===================== SSE parsing ===================== */
type SSEPacket = { event: string; data: any };

function parseSSEChunks(buffer: string) {
  // SSE event block separated by blank line
  const parts = buffer.split("\n\n");
  const remain = parts.pop() ?? "";
  const packets: SSEPacket[] = [];

  for (const block of parts) {
    const lines = block.split("\n");
    let event = "message";
    let dataStr = "";

    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }

    if (!dataStr) continue;
    try {
      packets.push({ event, data: JSON.parse(dataStr) });
    } catch {
      packets.push({ event, data: dataStr });
    }
  }

  return { packets, remain };
}

function stripConclusionLabel(s: string) {
  const t = (s ?? "").trim();
  // 常见：Conclusion: / Conclusion\n
  return t
    .replace(/^conclusion\s*[:：]\s*/i, "")
    .replace(/^结论\s*[:：]\s*/i, "")
    .trim();
}

/** ===================== Main ===================== */
function ChatPageInner() {
  const { data: session } = useSession();
  const sessionExists = !!session;
  const effectiveSession = session;
  const searchParams = useSearchParams();

  // UI
  const [settingsOpen, setSettingsOpen] = useState(false);

  // chat core
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // settings
  const [lang, setLang] = useState<Lang>("en");
  const isZh = lang === "zh";
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // dropdown mode
  const [mode, setMode] = useState<ChatMode>("normal");

  // sessions sidebar
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // billing modal
  const [planOpen, setPlanOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const { ent, refresh: refreshEnt } = useEntitlement(sessionExists);

  // login gating
  const detectorLocked = !sessionExists;
  const noteLocked = !sessionExists;

  // Stripe redirect: success/canceled
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

  // ===== Settings persistence (lang/theme) =====
  useEffect(() => {
    try {
      const savedLang = (localStorage.getItem("lang") as Lang) || "en";
      const savedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
      setLang(savedLang);
      setTheme(savedTheme);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ===== Sessions =====
  async function loadSessions() {
    if (!sessionExists) {
      setSessions([]);
      return;
    }
    try {
      setSessionsLoading(true);
      const res = await fetchWithTimeout("/api/chat/sessions", { timeoutMs: 15000 });
      const { data } = await safeReadJson(res);
      if (res.ok) setSessions(data?.sessions ?? []);
      else setSessions([]);
    } catch {
      setSessions([]);
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
      const res = await fetchWithTimeout(`/api/chat/session/${sessionId}`, { timeoutMs: 20000 });
      const { data } = await safeReadJson(res);

      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP_${res.status}`);

      const msgs: WorkflowMessage[] = (data?.messages ?? []).map((m: { role: string; content: string }) => {
        if (m.role === "assistant") {
          return {
            id: uid(),
            stage: "assistant",
            title: mode === "workflow" ? "AI" : "Assistant",
            subtitle: mode === "workflow" ? "Reply" : undefined,
            content: m.content ?? "",
          };
        }
        return { id: uid(), stage: "user", title: "You", content: m.content ?? "" };
      });

      setMessages(msgs);
      setChatSessionId(sessionId);
      setSidebarOpen(false);
    } catch (err) {
      console.error("加载会话消息失败：", err);
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
  }

  // ===== SSE workflow runner =====
  const abortRef = useRef<AbortController | null>(null);

  async function runWorkflowSSE(historyForApi: { role: "user" | "assistant"; content: string }[]) {
    const controller = new AbortController();
    abortRef.current = controller;

    // 用于最终折叠
    let plannerText = "";
    let writerText = "";
    let reviewText = "";
    let conclusionText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: historyForApi,
          mode: "team",
          chatSessionId,
          lang,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const { text, data } = await safeReadJson(res);
        const msg = data?.message || data?.error || text?.slice(0, 800) || `HTTP_${res.status}`;
        throw new Error(msg);
      }

      // UI：先插入 3 个 stage 占位（顺序固定）
      const plannerId = uid();
      const writerId = uid();
      const reviewerId = uid();

      setMessages((prev) => [
        ...prev,
        {
          id: plannerId,
          stage: "planner",
          title: "Planner",
          subtitle: isZh ? "规划" : "Plan",
          content: "",
        },
        {
          id: writerId,
          stage: "writer",
          title: "Writer",
          subtitle: isZh ? "生成" : "Draft",
          content: "",
        },
        {
          id: reviewerId,
          stage: "reviewer",
          title: "Reviewer",
          subtitle: isZh ? "审阅" : "Review",
          content: "",
        },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { packets, remain } = parseSSEChunks(buffer);
        buffer = remain;

        for (const p of packets) {
          if (p.event === "error") {
            const msg = p.data?.message || p.data?.error || "Unknown SSE error";
            throw new Error(msg);
          }

          if (p.event === "stage_done") {
            const stage = String(p.data?.stage || "");
            const content = String(p.data?.content || "");

            if (stage === "planner") {
              plannerText = content;
              setMessages((prev) => prev.map((m) => (m.id === plannerId ? { ...m, content } : m)));
            }

            if (stage === "writer") {
              writerText = content;
              setMessages((prev) => prev.map((m) => (m.id === writerId ? { ...m, content } : m)));
            }

            if (stage === "reviewer") {
              // 后端 reviewer stage_done 里已经带了 review / conclusion（你 route.ts 里加的）
              const review = String(p.data?.review || "");
              const conclusion = String(p.data?.conclusion || content || "");

              reviewText = review.trim();
              conclusionText = stripConclusionLabel(conclusion);

              // 最终：只保留一个 final bubble，把 planner + writer + (review) 折叠进去
              const children: WorkflowMessage[] = [
                {
                  id: uid(),
                  stage: "planner",
                  title: "Planner",
                  subtitle: isZh ? "规划" : "Plan",
                  content: plannerText || "",
                },
                {
                  id: uid(),
                  stage: "writer",
                  title: "Writer",
                  subtitle: isZh ? "生成" : "Draft",
                  content: writerText || "",
                },
              ];

              if (reviewText) {
                children.push({
                  id: uid(),
                  stage: "reviewer",
                  title: "Reviewer",
                  subtitle: isZh ? "Review" : "Review",
                  content: reviewText,
                });
              }

              const finalMsg: WorkflowMessage = {
                id: uid(),
                stage: "final",
                title: isZh ? "结论" : "Conclusion",
                subtitle: isZh ? "最终输出" : "Final",
                content: conclusionText || (isZh ? "（无结论输出）" : "(No conclusion)"),
                children,
                collapsed: true,
              };

              setMessages((prev) => {
                // 删除 planner/writer/reviewer 三个块（只留下 final）
                const next = prev.filter((m) => ![plannerId, writerId, reviewerId].includes(m.id));
                return next.concat(finalMsg);
              });
            }
          }

          if (p.event === "done") {
            // 更新 sessionId + sessions 列表
            const sid = p.data?.chatSessionId;
            if (sessionExists && sid) {
              setChatSessionId(sid);
              loadSessions();
            }
            if (sessionExists) refreshEnt();
          }
        }
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function handleSend() {
    if (mode === "detector" || mode === "note") return;
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const userMsg: WorkflowMessage = { id: uid(), stage: "user", title: "You", content: userText };

    const historyForApi = [
      ...messages.map((m) => ({ role: m.stage === "user" ? ("user" as const) : ("assistant" as const), content: m.content })),
      { role: "user" as const, content: userText },
    ];

    setMessages((prev) => [...prev, userMsg]);

    try {
      // ✅ workflow：SSE + team（3 次调用，planner->writer->reviewer）
      if (mode === "workflow") {
        await runWorkflowSSE(historyForApi);
        return;
      }

      // ✅ normal：一次 JSON（single）
      const placeholderId = uid();
      const placeholder: WorkflowMessage = { id: placeholderId, stage: "assistant", title: "Assistant", subtitle: isZh ? "生成中" : "Thinking", content: "" };
      setMessages((prev) => [...prev, placeholder]);

      const res = await fetchWithTimeout("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          mode: "single",
          chatSessionId,
          lang,
        }),
        timeoutMs: 90000,
      });

      const { text, data } = await safeReadJson(res);

      if (!res.ok) {
        const quotaHit =
          (data?.error && String(data.error).toLowerCase().includes("quota")) ||
          (data?.message && String(data.message).toLowerCase().includes("quota")) ||
          (text && text.toLowerCase().includes("quota"));

        const msg = quotaHit
          ? isZh
            ? "今日额度已用完，请升级套餐。"
            : "Quota exceeded. Please upgrade."
          : (data?.message || data?.error || text?.slice(0, 800) || `HTTP_${res.status}`);

        if (quotaHit) setPlanOpen(true);

        setMessages((prev) => prev.map((m) => (m.id === placeholderId ? { ...m, stage: "assistant", title: "AI", subtitle: "Error", content: msg } : m)));
        return;
      }

      const okData = data && typeof data === "object" ? data : {};
      const reply: string = okData.reply ?? (isZh ? "AI 暂时没有返回内容。" : "No response from AI.");

      if (sessionExists && okData.chatSessionId) {
        setChatSessionId(okData.chatSessionId);
        loadSessions();
      }
      if (sessionExists) refreshEnt();

      // normal：如果后端偶尔返回可解析 workflow JSON（兼容旧逻辑）
      const parsed = tryParseWorkflowReply(reply);
      if (parsed && parsed.length) {
        let finalStep = parsed.find((s) => s.stage === "final") || null;
        if (!finalStep) finalStep = parsed[parsed.length - 1];

        const children = parsed.filter((s) => s !== finalStep).map((s) => ({ ...s, id: uid() }));

        const finalMsg: WorkflowMessage = {
          id: uid(),
          stage: "final",
          title: finalStep.title ?? (isZh ? "结论" : "Conclusion"),
          subtitle: finalStep.subtitle ?? (isZh ? "最终输出" : "Final"),
          content: finalStep.content,
          children,
          collapsed: true,
        };

        setMessages((prev) => prev.filter((m) => m.id !== placeholderId).concat(finalMsg));
        return;
      }

      // typing effect
      const fullReply = reply;
      const step = 2;
      let i = 0;

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          i += step;
          const slice = fullReply.slice(0, i);

          setMessages((prev) => prev.map((m) => (m.id === placeholderId ? { ...m, content: slice } : m)));

          if (i >= fullReply.length) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, stage: "assistant", title: "Assistant", subtitle: undefined, content: fullReply }
            : m
        )
      );
    } catch (err: any) {
      console.error("调用 /api/chat 出错：", err);
      const msg = normalizeFetchError(err, isZh);

      setMessages((prev) => prev.concat({ id: uid(), stage: "assistant", title: "AI", subtitle: "Error", content: msg }));
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

  async function redeemCode(code: string) {
    setRedeemError(null);
    if (!code) return;
    setRedeemLoading(true);
    try {
      const res = await fetchWithTimeout("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        timeoutMs: 20000,
      });
      const { data } = await safeReadJson(res);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `Redeem error: ${res.status}`);
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
      const res = await fetchWithTimeout("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
        timeoutMs: 20000,
      });

      const { text, data } = await safeReadJson(res);

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

  const userInitial = effectiveSession?.user?.name?.[0] || effectiveSession?.user?.email?.[0] || "U";

  function setModeSafely(next: ChatMode) {
    if (!sessionExists && (next === "detector" || next === "note")) {
      setPlanOpen(true);
      return;
    }
    setMode(next);
  }

  return (
    <main
      className={[
        "h-screen w-screen overflow-hidden",
        theme === "dark"
          ? "text-slate-100 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"
          : "text-slate-900 bg-gradient-to-b from-slate-50 via-white to-slate-100",
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
          <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 animate-pulse shadow-lg shadow-blue-500/40" />
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-widest text-slate-400">Workspace</p>
                <p className="text-sm font-semibold text-slate-50">{isZh ? "AI 工作台" : "AI Workspace"}</p>

                <button
                  onClick={() => setSettingsOpen(true)}
                  className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center"
                  title={isZh ? "设置" : "Settings"}
                >
                  ⚙️
                </button>
              </div>
            </div>

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

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pr-1 pb-3 space-y-1 mt-1 custom-scrollbar">
            {!sessionExists && <div className="px-3 py-3 text-xs text-slate-400">{isZh ? "未登录：不会保存历史会话。" : "Not signed in: conversations are not saved."}</div>}

            {sessionExists && sessionsLoading && <div className="px-3 py-2 text-xs text-slate-400">{isZh ? "正在加载历史会话…" : "Loading sessions…"}</div>}

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
                  <ChatHistoryRow
                    key={s.id}
                    s={s}
                    isActive={isActive}
                    isZh={isZh}
                    busy={isLoading}
                    onSelect={() => handleSelectSession(s.id)}
                    onRenamed={() => loadSessions()}
                    onPinnedChange={() => loadSessions()}
                    onDeleted={() => {
                      if (chatSessionId === s.id) {
                        setMessages([]);
                        setInput("");
                        setChatSessionId(null);
                      }
                      loadSessions();
                    }}
                  />
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
                <h1 className="font-semibold text-sm text-slate-100">
                  {mode === "workflow"
                    ? isZh
                      ? "聊天 · 工作流"
                      : "Chat · Workflow"
                    : mode === "normal"
                    ? isZh
                      ? "聊天 · 普通"
                      : "Chat · Normal"
                    : mode === "detector"
                    ? isZh
                      ? "AI 检测"
                      : "AI Detector"
                    : isZh
                    ? "AI 笔记"
                    : "AI Note"}
                </h1>
                <p className="text-[11px] text-slate-400">
                  {mode === "workflow"
                    ? "Planner · Writer · Reviewer · Final"
                    : mode === "normal"
                    ? isZh
                      ? "快速，传统对话模式"
                      : "Fast, classic chat mode"
                    : mode === "detector"
                    ? isZh
                      ? "文本检测"
                      : "Text analysis"
                    : isZh
                    ? "笔记生成"
                    : "Note generation"}
                </p>
              </div>
            </div>

            {/* Center */}
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
            <div className="flex items-center gap-2">
              <ModeDropdown value={mode} onChange={setModeSafely} lang={lang} disabled={isLoading} />

              <button
                onClick={() => setSettingsOpen(true)}
                className="h-9 w-9 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                title={isZh ? "设置" : "Settings"}
              >
                ⚙️
              </button>

              {sessionExists ? (
                <button
                  onClick={() => signOut()}
                  className="h-9 px-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                  title={effectiveSession?.user?.email || ""}
                >
                  {String(userInitial).toUpperCase()}
                </button>
              ) : (
                <button
                  onClick={() => signIn()}
                  className="h-9 px-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs"
                >
                  {isZh ? "登录" : "Sign in"}
                </button>
              )}
            </div>
          </header>

          {/* Body */}
          {mode === "detector" ? (
            <DetectorUI isLoadingGlobal={isLoading} isZh={isZh} locked={detectorLocked} canSeeSuspicious={!!ent?.canSeeSuspiciousSentences} />
          ) : mode === "note" ? (
            <NoteUI isLoadingGlobal={isLoading} isZh={isZh} locked={noteLocked} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 custom-scrollbar">
                {mode === "workflow" ? (
                  messages.map((m) => (
                    <Bubble
                      key={m.id}
                      msg={m}
                      isZh={isZh}
                      onToggle={(id) => {
                        setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, collapsed: !(x.collapsed !== false) } : x)));
                      }}
                    />
                  ))
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.stage === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={[
                          "px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap max-w-[80%] border backdrop-blur-sm",
                          m.stage === "user"
                            ? "bg-slate-800/70 text-slate-100 border-slate-700/60"
                            : "bg-slate-900/80 text-slate-100 border-white/10",
                        ].join(" ")}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {isZh ? "生成中……" : "Generating…"}
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
      <RedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        isZh={isZh}
        onRedeem={redeemCode}
        loading={redeemLoading}
        error={redeemError}
      />

      {/* Settings */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isZh={isZh}
        theme={theme}
        setTheme={setTheme}
        lang={lang}
        setLang={setLang}
      />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}