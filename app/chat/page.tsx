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
import { StudyUI } from "@/components/workspace/study/StudyUI";

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
  usedNoteGeneratesToday?: number;
  usedChatInputCharsWindow?: number;
  usedStudyCountToday: number;

  chatInputMaxChars?: number;
  chatBudgetCharsPerWindow?: number;
  chatBudgetWindowHours?: number;
  chatCooldownMs?: number;
  noteGeneratesPerDay?: number;
  noteInputMaxChars?: number;
  noteMaxItems?: number;
  noteCooldownMs?: number;
  studyGenerationsPerDay: number;
  studyMaxFileSizeBytes: number;
  studyMaxExtractedChars: number;
  studyMaxQuizQuestions: number;
  studyMaxSelectableModes?: number;
  studyAllowedDifficulties: ("easy" | "medium" | "hard")[];

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

function buildHttpErrorMessage(opts: { res: Response; data: any; text: string; isZh: boolean }) {
  const { res, data, text, isZh } = opts;
  const payload =
    data && typeof data === "object"
      ? JSON.stringify({ status: res.status, data })
      : `status=${res.status}, body=${(text || "").slice(0, 800)}`;

  const hint =
    res.status === 401
      ? isZh
        ? "（可能未登录 / session cookie 没带上）"
        : "(likely not signed in / missing session cookie)"
      : res.status === 404
      ? isZh
        ? "（会话不存在，或不属于当前账号）"
        : "(session not found or not owned by current user)"
      : res.status === 400
      ? isZh
        ? "（请求参数不对，比如 sessionId 为空）"
        : "(bad request, e.g. missing sessionId)"
      : "";

  return (data?.message || data?.error || `HTTP_${res.status}`) + " " + hint + "\n" + payload;
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
      const res = await fetchWithTimeout("/api/billing/status", { cache: "no-store", timeoutMs: 15000, credentials: "include" });
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
  const studyLocked = !sessionExists;

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

  useEffect(() => {
    if (mode === "study") {
      setSidebarOpen(false);
    }
  }, [mode]);

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

  // auto scroll to bottom when messages change
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ===== Sessions =====
  async function loadSessions() {
    if (!sessionExists) {
      setSessions([]);
      return;
    }
    try {
      setSessionsLoading(true);
      const res = await fetchWithTimeout("/api/chat/sessions", {
        timeoutMs: 15000,
        cache: "no-store",
        credentials: "include",
      });
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

    if (!sessionId || typeof sessionId !== "string") {
      setMessages([{ id: uid(), stage: "assistant", title: "AI", subtitle: "Error", content: isZh ? "无效的会话 ID" : "Invalid session id" }]);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetchWithTimeout(`/api/chat/session/${sessionId}`, {
        timeoutMs: 20000,
        cache: "no-store",
        credentials: "include",
      });

      const { data, text } = await safeReadJson(res);

      if (!res.ok) {
        throw new Error(buildHttpErrorMessage({ res, data, text, isZh }));
      }

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
    } catch (err: any) {
      const msg = normalizeFetchError(err, isZh);
      setMessages([{ id: uid(), stage: "assistant", title: "AI", subtitle: "Error", content: msg }]);
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
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        const { text, data } = await safeReadJson(res);
        const msg = data?.message || data?.error || text?.slice(0, 800) || `HTTP_${res.status}`;
        throw new Error(msg);
      }

      const plannerId = uid();
      const writerId = uid();
      const reviewerId = uid();

      setMessages((prev) => [
        ...prev,
        { id: plannerId, stage: "planner", title: "Planner", subtitle: isZh ? "规划" : "Plan", content: "" },
        { id: writerId, stage: "writer", title: "Writer", subtitle: isZh ? "生成" : "Draft", content: "" },
        { id: reviewerId, stage: "reviewer", title: "Reviewer", subtitle: isZh ? "审阅" : "Review", content: "" },
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
              const review = String(p.data?.review || "");
              const conclusion = String(p.data?.conclusion || content || "");

              reviewText = review.trim();
              conclusionText = stripConclusionLabel(conclusion);

              const children: WorkflowMessage[] = [
                { id: uid(), stage: "planner", title: "Planner", subtitle: isZh ? "规划" : "Plan", content: plannerText || "" },
                { id: uid(), stage: "writer", title: "Writer", subtitle: isZh ? "生成" : "Draft", content: writerText || "" },
              ];

              if (reviewText) {
                children.push({ id: uid(), stage: "reviewer", title: "Reviewer", subtitle: "Review", content: reviewText });
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
                const next = prev.filter((m) => ![plannerId, writerId, reviewerId].includes(m.id));
                return next.concat(finalMsg);
              });
            }
          }

          if (p.event === "done") {
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
    if (mode === "detector" || mode === "note" || mode === "study") return;
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
      if (mode === "workflow") {
        await runWorkflowSSE(historyForApi);
        return;
      }

      const placeholderId = uid();
      const placeholder: WorkflowMessage = {
        id: placeholderId,
        stage: "assistant",
        title: "Assistant",
        subtitle: isZh ? "生成中" : "Thinking",
        content: "",
      };
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
        credentials: "include",
        cache: "no-store",
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
          : data?.message || data?.error || text?.slice(0, 800) || `HTTP_${res.status}`;

        if (quotaHit) setPlanOpen(true);

        setMessages((prev) =>
          prev.map((m) => (m.id === placeholderId ? { ...m, stage: "assistant", title: "AI", subtitle: "Error", content: msg } : m))
        );
        return;
      }

      const okData = data && typeof data === "object" ? data : {};
      const reply: string = okData.reply ?? (isZh ? "AI 暂时没有返回内容。" : "No response from AI.");

      if (sessionExists && okData.chatSessionId) {
        setChatSessionId(okData.chatSessionId);
        loadSessions();
      }
      if (sessionExists) refreshEnt();

      const parsed = (okData?.workflow ? tryParseWorkflowReply(reply) : null) as WorkflowMessage[] | null;
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
        prev.map((m) => (m.id === placeholderId ? { ...m, stage: "assistant", title: "Assistant", subtitle: undefined, content: fullReply } : m))
      );
    } catch (err: any) {
      const msg = normalizeFetchError(err, isZh);
      setMessages((prev) => prev.concat({ id: uid(), stage: "assistant", title: "AI", subtitle: "Error", content: msg }));
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mode === "detector" || mode === "note" || mode === "study") return;
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
        credentials: "include",
        cache: "no-store",
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
        credentials: "include",
        cache: "no-store",
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
    if (!sessionExists && (next === "detector" || next === "note" || next === "study")) {
      setPlanOpen(true);
      return;
    }
    setMode(next);
  }

  // 始终强制黑色/未来感主题基调
  const isDark = theme === "dark" || true;

  return (
    <main className="h-screen w-screen overflow-hidden text-slate-200 bg-[#030303] font-sans selection:bg-blue-500/30 selection:text-blue-100 relative">
      <PlanPillStyles />

      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none base-grid" />

      <div className="relative z-10 h-full w-full flex">
        {/* 全局遮罩：桌面和移动端都一样，只有 sidebarOpen 时显示 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar：默认隐藏，点击菜单按钮才展开 */}
        <aside
          className={[
            "fixed z-50 left-0 top-0 h-full w-[280px]",
            "border-r border-white/5 bg-[#080808]",
            "transform transition-transform duration-300 ease-out flex flex-col",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar Header */}
          <div className="px-5 pt-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-6 w-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-sm" />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Terminal</p>
                <p className="text-sm font-bold text-slate-200">{isZh ? "AI 工作台" : "Workspace"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="h-7 w-7 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors flex items-center justify-center text-slate-300 shadow-sm"
                title={isZh ? "新对话" : "New Chat"}
              >
                +
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="h-7 w-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/10 transition-colors"
                title={isZh ? "关闭侧边栏" : "Close sidebar"}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="px-5 pb-2">
            <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 space-y-0.5 custom-scrollbar">
            {!sessionExists && (
              <div className="px-3 py-4 text-xs text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                {isZh ? "未登录：不会保存历史会话。" : "Not signed in: sessions are not saved."}
              </div>
            )}

            {sessionExists && sessionsLoading && (
              <div className="px-3 py-4 text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-ping" />
                {isZh ? "加载缓存中..." : "Loading cache..."}
              </div>
            )}

            {sessionExists && !sessionsLoading && sessions.length === 0 && (
              <div className="px-3 py-4 text-xs text-slate-500 italic">
                {isZh ? "暂无连接记录。" : "No connections found."}
              </div>
            )}

            {sessionExists &&
              sessions.map((s) => (
                <ChatHistoryRow
                  key={s.id}
                  s={s}
                  isActive={s.id === chatSessionId}
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
              ))}
          </div>

          {/* Sidebar Footer (Settings & User) */}
          <div className="p-4 mt-auto border-t border-white/5 bg-[#050505]">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="text-sm">⚙️</span> {isZh ? "系统设置" : "Settings"}
              </button>

              {sessionExists ? (
                <button
                  onClick={() => signOut()}
                  className="h-8 w-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center text-xs font-mono text-slate-300"
                  title={effectiveSession?.user?.email || ""}
                >
                  {String(userInitial).toUpperCase()}
                </button>
              ) : (
                <button
                  onClick={() => signIn()}
                  className="px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-medium"
                >
                  {isZh ? "接入认证" : "Authenticate"}
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative min-w-0 bg-[#030303]">
          {/* Header */}
          <header className="h-16 border-b border-white/5 px-4 md:px-6 flex items-center justify-between gap-4 bg-[#080808]/80 backdrop-blur-md z-20 shrink-0">
            {/* Left */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (mode === "study") {
                    window.dispatchEvent(new Event("study:open-history"));
                    return;
                  }
                  setSidebarOpen(true);
                }}
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                title={mode === "study" ? "Open Study History" : isZh ? "打开侧边栏" : "Open sidebar"}
              >
                ☰
              </button>

              <div className="flex flex-col">
                <h1 className="font-semibold text-sm text-slate-100 tracking-wide flex items-center gap-2">
                  {mode === "workflow"
                    ? isZh
                      ? "多角色矩阵"
                      : "Team Matrix"
                    : mode === "normal"
                    ? isZh
                      ? "标准终端"
                      : "Standard Terminal"
                    : mode === "detector"
                    ? isZh
                      ? "AI 侦测"
                      : "AI Detector"
                    : isZh
                    ? "智能笔记"
                    : "Smart Note"}
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </h1>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                  {mode === "workflow"
                    ? "P-W-R Flow Active"
                    : mode === "normal"
                    ? "Direct Connection"
                    : mode === "detector"
                    ? "Analysis Mode"
                    : "Parsing Mode"}
                </p>
              </div>
            </div>

            {/* Center (Billing) */}
            <div className="hidden md:flex items-center justify-center flex-1">
              <div className="bg-[#050505] rounded-full p-0.5 border border-white/5 shadow-inner">
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
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <ModeDropdown value={mode} onChange={setModeSafely} lang={lang} disabled={isLoading} />
            </div>
          </header>

          {/* Body */}
          {mode === "detector" ? (
            <DetectorUI isLoadingGlobal={isLoading} isZh={isZh} locked={detectorLocked} canSeeSuspicious={!!ent?.canSeeSuspiciousSentences} />
          ) : mode === "note" ? (
            <NoteUI isLoadingGlobal={isLoading} isZh={isZh} locked={noteLocked} entitlement={ent} onUsageRefresh={refreshEnt} />
          ) : mode === "study" ? (
            <StudyUI isZh={isZh} locked={studyLocked} entitlement={ent} onUsageRefresh={refreshEnt} />
          ) : (
            <>
              {/* Chat Message Area */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar scroll-smooth">
                {messages.length === 0 && !isLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
                    <div className="w-12 h-12 mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <span className="text-xl">⚡️</span>
                    </div>
                    <p className="text-sm font-medium">{isZh ? "系统已就绪，等待输入" : "System ready. Awaiting input."}</p>
                  </div>
                )}

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
                    <div key={m.id} className={`flex w-full ${m.stage === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={[
                          "px-4 py-3 rounded-2xl text-[14px] leading-relaxed max-w-[85%] md:max-w-[75%] whitespace-pre-wrap transition-all",
                          m.stage === "user"
                            ? "bg-blue-600/15 text-blue-50 border border-blue-500/20 rounded-br-sm shadow-[0_0_15px_rgba(59,130,246,0.05)]"
                            : "bg-[#0f0f0f] text-slate-200 border border-white/5 rounded-bl-sm shadow-sm",
                        ].join(" ")}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-mono tracking-widest uppercase mt-4 opacity-80 pl-2">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    {isZh ? "数据处理中..." : "Processing..."}
                  </div>
                )}

                <div className="h-4" />
              </div>

              {/* Input Area (Console Style) */}
              <div className="p-4 md:px-8 md:pb-6 pt-2 bg-gradient-to-t from-[#030303] via-[#030303] to-transparent shrink-0">
                <div className="max-w-4xl mx-auto relative flex flex-col gap-2">
                  <div className="relative flex items-end bg-[#0a0a0a] rounded-3xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)] transition-all focus-within:border-blue-500/40 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                    <textarea
                      className="flex-1 max-h-40 min-h-[52px] w-full bg-transparent text-slate-100 placeholder:text-slate-600 px-5 py-4 text-sm resize-none focus:outline-none focus:ring-0 custom-scrollbar"
                      placeholder={isZh ? "输入指令，Enter 执行，Shift+Enter 换行" : "Enter command, press Enter to execute"}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isLoading}
                      rows={1}
                      style={{ height: "auto" }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "auto";
                        target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                      }}
                    />

                    <div className="pr-3 pb-3 shrink-0">
                      <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="h-10 w-10 md:w-auto md:px-5 rounded-2xl bg-white text-black text-sm font-bold flex items-center justify-center gap-2 disabled:bg-white/10 disabled:text-slate-500 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        <span className="hidden md:inline">{isZh ? "发送" : "Send"}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {sessionExists && ent && !ent.unlimited && ent.plan === "basic" && (
                    <div className="px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono uppercase tracking-wide">
                      <span>
                        {isZh ? "今日调用限制:" : "Daily limit:"}{" "}
                        <span className="text-slate-300">
                          {ent.usedChatCountToday}/{ent.chatPerDay}
                        </span>
                      </span>
                      <button onClick={() => setPlanOpen(true)} className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2">
                        {isZh ? "升级权限" : "Upgrade Access"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
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

      <RedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        isZh={isZh}
        onRedeem={redeemCode}
        loading={redeemLoading}
        error={redeemError}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isZh={isZh}
        theme={theme}
        setTheme={setTheme}
        lang={lang}
        setLang={setLang}
      />

      <style jsx global>{`
        .base-grid {
          background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 24px 24px;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        }

        textarea {
          outline: none;
        }
      `}</style>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-[#030303] flex items-center justify-center text-slate-500 font-mono text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-3" />
          INITIALIZING...
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
