"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut, getProviders, type ClientSafeProvider } from "next-auth/react";
import { useSearchParams } from "next/navigation";

// 缁勪欢锛堜綘鐜版湁锛?
import { PlanPillStyles, PlanPillButton } from "@/components/chat/billing/PlanPill";
import { PlanModal } from "@/components/chat/billing/PlanModal";
import { RedeemModal } from "@/components/chat/billing/RedeemModal";
import { SettingsModal } from "@/components/chat/settings/SettingsModal";
import { ChatHistoryRow } from "@/components/chat/sidebar/ChatHistoryRow";
import { DetectorUI } from "@/components/workspace/detector/DetectorUI";
import { HumanizerUI } from "@/components/workspace/humanizer/HumanizerUI";
import { NoteUI } from "@/components/workspace/note/NoteUI";
import { StudyUI } from "@/components/workspace/study/StudyUI";
import { AiFormattedText } from "@/components/shared/AiFormattedText";
import { CopyButton } from "@/components/ui/copy-button";

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
  source?: "developer_override" | "paid_subscription" | "promo" | "free";
  stripeStatus?: string | null;
  daysLeft?: number | null;
  unlimited: boolean;

  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;

  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedHumanizerWordsThisWeek: number;
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
  humanizerWordsPerWeek: number;
  humanizerMaxInputWords: number;
  humanizerMinInputWords: number;
  humanizerCooldownMs?: number;
  studyGenerationsPerDay: number;
  studyMaxFileSizeBytes: number;
  studyMaxExtractedChars: number;
  studyMaxQuizQuestions: number;
  studyMaxSelectableModes?: number;
  studyAllowedDifficulties: ("easy" | "medium" | "hard")[];

  canSeeSuspiciousSentences: boolean;
};
type RedeemSuccessState = {
  plan: string;
  grantEndAt: string | null;
};
type AuthProviderMap = Record<string, ClientSafeProvider>;

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
    return isZh
      ? "请求超时：后端可能卡住了，或者正在重启。"
      : "Request timed out: backend may be stuck or restarting.";
  }
  const msg = String(err?.message || err || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    return isZh
      ? "网络请求失败：后端连接断开、崩溃，或者正在重启。"
      : "Network request failed: backend disconnected/crashed/restarting.";
  }
  return (isZh ? "请求失败：" : "Request failed: ") + msg;
}

function workflowFailureMessage(error: any, isZh: boolean) {
  const code = String(error?.code || error?.error || "");
  const message = String(error?.message || "");

  if (code === "UPSTREAM_TIMEOUT" || code === "OPENROUTER_TIMEOUT" || code === "GROQ_TIMEOUT" || /timeout/i.test(message)) {
    return isZh ? "Workflow 超时，请重试。" : "Workflow timed out. Please try again.";
  }
  if (code === "ALL_WORKFLOW_MODELS_FAILED") {
    return isZh ? "Workflow 所有模型都失败了，请稍后再试。" : "All workflow models failed. Please try again later.";
  }
  return isZh ? "Workflow 生成失败，请重试。" : "Workflow generation failed. Please try again.";
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
        ? "锛堝彲鑳芥湭鐧诲綍 / session cookie 娌″甫涓婏級"
        : "(likely not signed in / missing session cookie)"
      : res.status === 404
      ? isZh
        ? "锛堜細璇濅笉瀛樺湪锛屾垨涓嶅睘浜庡綋鍓嶈处鍙凤級"
        : "(session not found or not owned by current user)"
      : res.status === 400
      ? isZh
        ? "（请求参数不正确，比如 sessionId 为空）"
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

function formatGiftGrantEndAt(grantEndAt: string | null, isZh: boolean) {
  if (!grantEndAt) return isZh ? "瀹稿弶绺哄ú?" : "Active now";
  const parsed = new Date(grantEndAt);
  if (!Number.isFinite(parsed.getTime())) return grantEndAt;
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatGiftPlan(plan: string, isZh: boolean) {
  if (plan.toLowerCase() === "pro") return "Pro";
  if (plan.toLowerCase() === "ultra") return isZh ? "Ultra 娑撴挷绗熼悧?" : "Ultra Pro";
  return plan;
}

function HeaderAuthMenu({
  isZh,
  sessionExists,
  userInitial,
  userLabel,
  userEmail,
  visibleAuthProviders,
  onOpenAccount,
  onOpenBilling,
  onOpenSettings,
  onSignOut,
}: {
  isZh: boolean;
  sessionExists: boolean;
  userInitial: string;
  userLabel: string;
  userEmail: string;
  visibleAuthProviders: ClientSafeProvider[];
  onOpenAccount: () => void;
  onOpenBilling: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState<"signin" | "account" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      {sessionExists ? (
        <button
          onClick={() => setMenuOpen((current) => (current === "account" ? null : "account"))}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 shadow-[0_10px_30px_rgba(2,6,23,0.2)] backdrop-blur-xl transition hover:bg-white/[0.07]"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 text-xs font-semibold text-white shadow-md shadow-blue-500/40"
            title={userEmail}
          >
            {String(userInitial).toUpperCase()}
          </div>
          <div className="hidden min-w-0 sm:flex items-center gap-2 text-[11px] leading-tight">
            <span className="max-w-[132px] truncate text-slate-100">{userLabel}</span>
            <span className="text-slate-500">▼</span>
          </div>
        </button>
      ) : (
        <button
          onClick={() => setMenuOpen((current) => (current === "signin" ? null : "signin"))}
          className="rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-blue-500/40 transition-all hover:brightness-110"
        >
          {isZh ? "闁谎嗩嚙缂?" : "Sign in"}
        </button>
      )}

      {menuOpen === "signin" && !sessionExists && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-3xl border border-white/10 bg-[#080808]/95 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/8 px-3 py-2">
            <p className="text-sm font-semibold text-slate-50">{isZh ? "闁谎嗩嚙缂?" : "Sign in"}</p>
          </div>
          <div className="space-y-1 px-1 py-2">
            {visibleAuthProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  setMenuOpen(null);
                  signIn(provider.id);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-white/10"
              >
                <span>
                  {provider.id === "google"
                    ? isZh
                      ? "缂佈呯敾娴ｈ法鏁?Google"
                      : "Continue with Google"
                    : provider.id === "github"
                    ? isZh
                      ? "缂佈呯敾娴ｈ法鏁?GitHub"
                      : "Continue with GitHub"
                    : provider.name}
                </span>
                <span className="text-slate-500">↗</span>
              </button>
            ))}
            {visibleAuthProviders.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-400">
                {isZh ? "閺嗗倹婀Λ鈧ù瀣煂閸欘垳鏁ら惃鍕瑜版洘鏌熷?" : "No sign-in providers are currently available."}
              </div>
            )}
          </div>
        </div>
      )}

      {menuOpen === "account" && sessionExists && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-3xl border border-white/10 bg-[#080808]/95 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/8 px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-50">{userLabel}</p>
            <p className="truncate text-[11px] text-slate-500">{userEmail}</p>
          </div>
          <div className="space-y-1 px-1 py-2">
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenAccount();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {isZh ? "账户" : "Account"}
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenBilling();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              Billing
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenSettings();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {isZh ? "设置" : "Settings"}
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onSignOut();
              }}
              className="flex w-full items-center rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-100 transition hover:bg-red-500/15"
            >
              {isZh ? "闂侇偀鍋撻柛鎴ｆ濞呫儴銇?" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // settings
  const [lang, setLang] = useState<Lang>("en");
  const isZh = lang === "zh";

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
  const [redeemSuccess, setRedeemSuccess] = useState<RedeemSuccessState | null>(null);
  const [authProviders, setAuthProviders] = useState<AuthProviderMap>({});

  const { ent, refresh: refreshEnt } = useEntitlement(sessionExists);

  // login gating
  const detectorLocked = !sessionExists;
  const humanizerLocked = !sessionExists;
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
    let cancelled = false;

    async function loadProviders() {
      try {
        const providers = await getProviders();
        if (!cancelled) {
          setAuthProviders(providers ?? {});
        }
      } catch {
        if (!cancelled) {
          setAuthProviders({});
        }
      }
    }

    if (!sessionExists) {
      loadProviders();
    }

    return () => {
      cancelled = true;
    };
  }, [sessionExists]);

  useEffect(() => {
    if (mode === "study") {
      setSidebarOpen(false);
    }
  }, [mode]);

  // ===== Settings persistence (language) =====
  useEffect(() => {
    try {
      const savedLang = (localStorage.getItem("lang") as Lang) || "en";
      setLang(savedLang);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

  // auto scroll to bottom when messages change
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = window.setTimeout(() => setCopiedMessageId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedMessageId]);

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
      setMessages([{ id: uid(), stage: "assistant", title: "AI", subtitle: "Error", content: isZh ? "鏃犳晥鐨勪細璇?ID" : "Invalid session id" }]);
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
    let plannerId = "";
    let writerId = "";
    let reviewerId = "";
    let plannerDone = false;
    let writerDone = false;

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

      plannerId = uid();
      writerId = uid();
      reviewerId = uid();

      setMessages((prev) => [
        ...prev,
        { id: plannerId, stage: "planner", title: "Planner", subtitle: isZh ? "瑙勫垝" : "Plan", content: "" },
        { id: writerId, stage: "writer", title: "Writer", subtitle: isZh ? "鍒濊崏" : "Draft", content: "" },
        { id: reviewerId, stage: "reviewer", title: isZh ? "审阅 + 结论" : "Reviewer + Conclusion", subtitle: isZh ? "修订后的最终稿" : "Improved Final Draft", content: "" },
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
            const err: any = new Error(p.data?.message || p.data?.error || "Unknown SSE error");
            err.code = p.data?.error;
            err.extra = p.data?.extra;
            throw err;
          }

          if (p.event === "stage_done") {
            const stage = String(p.data?.stage || "");
            const content = String(p.data?.content || "");

            if (stage === "planner") {
              plannerDone = true;
              setMessages((prev) => prev.map((m) => (m.id === plannerId ? { ...m, content } : m)));
            }

            if (stage === "writer") {
              writerDone = true;
              setMessages((prev) => prev.map((m) => (m.id === writerId ? { ...m, content: content || (isZh ? "（无输出）" : "(No output)") } : m)));
            }

            if (stage === "reviewer" || stage === "final") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === reviewerId
                    ? {
                        ...m,
                        stage: "reviewer",
                        title: isZh ? "审阅 + 结论" : "Reviewer + Conclusion",
                        subtitle: isZh ? "修订后的最终稿" : "Improved Final Draft",
                        content: content || (isZh ? "（无输出）" : "(No output)"),
                      }
                    : m
                )
              );
            }
          }

          if (p.event === "stage_delta") {
            const stage = String(p.data?.stage || "");
            if (stage === "writer") {
              const content = String(p.data?.content || "");
              setMessages((prev) => prev.map((m) => (m.id === writerId ? { ...m, content } : m)));
            }
            if (stage === "reviewer" || stage === "final") {
              const content = String(p.data?.content || "");
              setMessages((prev) => prev.map((m) => (m.id === reviewerId ? { ...m, stage: "reviewer", content } : m)));
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
    } catch (error: any) {
      const content = workflowFailureMessage(error, isZh);
      const failedSubtitle = isZh ? "失败" : "Failed";

      if (!plannerId || !writerId || !reviewerId) {
        setMessages((prev) =>
          prev.concat({
            id: uid(),
            stage: "reviewer",
            title: isZh ? "审阅 + 结论" : "Reviewer + Conclusion",
            subtitle: failedSubtitle,
            content,
          })
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (!plannerDone && m.id === plannerId) {
            return { ...m, subtitle: failedSubtitle, content };
          }
          if (plannerDone && !writerDone && m.id === writerId) {
            const nextContent = m.content?.trim() ? `${m.content}\n\n${content}` : content;
            return { ...m, subtitle: failedSubtitle, content: nextContent };
          }
          if (plannerDone && writerDone && m.id === reviewerId) {
            return { ...m, stage: "reviewer", subtitle: failedSubtitle, content };
          }
          return m;
        })
      );
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
      if (mode === "workflow") return;
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
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `Redeem error: ${res.status}`);
      setRedeemSuccess({
        plan: String(data?.plan || "pro"),
        grantEndAt: data?.grantEndAt ? String(data.grantEndAt) : null,
      });
      await refreshEnt();
    } catch (e: any) {
      setRedeemError(e?.message || (isZh ? "鍏戞崲澶辫触" : "Redeem failed"));
    } finally {
      setRedeemLoading(false);
    }
  }

  useEffect(() => {
    if (!redeemOpen || !redeemSuccess) return;
    const timer = window.setTimeout(() => {
      setRedeemOpen(false);
    }, 1850);
    return () => window.clearTimeout(timer);
  }, [redeemOpen, redeemSuccess]);

  function openRedeemModal() {
    setRedeemError(null);
    setRedeemSuccess(null);
    setRedeemOpen(true);
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
  const visibleAuthProviders = ["google", "github"]
    .map((id) => authProviders[id])
    .filter((provider): provider is ClientSafeProvider => Boolean(provider));
  const userLabel = effectiveSession?.user?.name || effectiveSession?.user?.email || "User";
  const userEmail = effectiveSession?.user?.email || "";

  function openAccountPage() {
    window.location.href = "/account";
  }

  function setModeSafely(next: ChatMode) {
    if (!sessionExists && (next === "detector" || next === "note" || next === "study" || next === "humanizer")) {
      setPlanOpen(true);
      return;
    }
    setMode(next);
  }

  // 濮嬬粓寮哄埗榛戣壊/鏈潵鎰熶富棰樺熀璋?
  return (
    <main className="h-screen w-screen overflow-hidden text-slate-200 bg-[#030303] font-sans selection:bg-blue-500/30 selection:text-blue-100 relative">
      <PlanPillStyles />

      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none base-grid" />

      <div className="relative z-10 h-full w-full flex">
        {/* 鍏ㄥ眬閬僵锛氭闈㈠拰绉诲姩绔兘涓€鏍凤紝鍙湁 sidebarOpen 鏃舵樉绀?*/}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar锛氶粯璁ら殣钘忥紝鐐瑰嚮鑿滃崟鎸夐挳鎵嶅睍寮€ */}
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
                ×
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
                <span className="text-sm">鈿欙笍</span> {isZh ? "绯荤粺璁剧疆" : "Settings"}
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
                  {isZh ? "鎺ュ叆璁よ瘉" : "Authenticate"}
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
                      ? "鏍囧噯缁堢"
                      : "Standard Terminal"
                    : mode === "detector"
                    ? isZh
                      ? "AI 渚︽祴"
                      : "AI Detector"
                    : isZh
                    ? "鏅鸿兘绗旇"
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
            <div className="mr-1 flex items-center gap-3 md:mr-2">
              <ModeDropdown value={mode} onChange={setModeSafely} lang={lang} disabled={isLoading} />
              <HeaderAuthMenu
                isZh={isZh}
                sessionExists={sessionExists}
                userInitial={String(userInitial)}
                userLabel={userLabel}
                userEmail={userEmail}
                visibleAuthProviders={visibleAuthProviders}
                onOpenAccount={openAccountPage}
                onOpenBilling={() => {
                  refreshEnt();
                  setPlanOpen(true);
                }}
                onOpenSettings={() => setSettingsOpen(true)}
                onSignOut={() => signOut()}
              />
              <div className="hidden">
              {sessionExists ? (
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 shadow-[0_10px_30px_rgba(2,6,23,0.2)] backdrop-blur-xl">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 text-xs font-semibold text-white shadow-md shadow-blue-500/40"
                    title={effectiveSession?.user?.email || ""}
                  >
                    {String(userInitial).toUpperCase()}
                  </div>
                  <div className="hidden min-w-0 sm:flex flex-col text-[11px] leading-tight">
                    <span className="max-w-[132px] truncate text-slate-100">
                      {effectiveSession?.user?.name || effectiveSession?.user?.email || "User"}
                    </span>
                    <button
                      onClick={() => signOut()}
                      className="text-left text-xs text-slate-400 transition hover:text-slate-200 hover:underline underline-offset-2"
                    >
                      {isZh ? "闁偓閸戣櫣娅ヨぐ?" : "Sign out"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {visibleAuthProviders.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => signIn(provider.id)}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                        provider.id === "google"
                          ? "bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-white shadow-md shadow-blue-500/40 hover:brightness-110"
                          : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {provider.id === "google"
                        ? isZh
                          ? "Google 登录"
                          : "Google"
                        : provider.id === "github"
                        ? isZh
                          ? "GitHub 登录"
                          : "GitHub"
                        : provider.name}
                    </button>
                  ))}
                  {visibleAuthProviders.length === 0 && (
                    <button
                      onClick={() => signIn()}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 transition-all hover:bg-white/10"
                    >
                      {isZh ? "登录" : "Sign in"}
                    </button>
                  )}
                </div>
              )}
              </div>
            </div>
          </header>

          {redeemSuccess && (
            <div className="px-4 pt-4 md:px-8">
              <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.08] to-emerald-400/[0.08] px-4 py-4 shadow-[0_18px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-white/10 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                      <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-blue-300 via-white to-emerald-300 shadow-[0_0_16px_rgba(96,165,250,0.7)]" />
                    </div>
                    <div>
                      <p className="bg-gradient-to-r from-blue-200 via-white to-emerald-200 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
                        {isZh ? "恭喜，礼包已生效" : "Congratulations, your gift is live"}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        {formatGiftPlan(redeemSuccess.plan, isZh)} {isZh ? "已解锁，有效期至" : "unlocked, active until"}{" "}
                        <span className="font-semibold text-white">{formatGiftGrantEndAt(redeemSuccess.grantEndAt, isZh)}</span>
                      </p>
                      <p className="mt-1 text-[12px] text-slate-400">
                        {isZh ? "现在可以使用已解锁的高级功能。" : "Your upgraded features are ready to use now."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setRedeemSuccess(null)}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    {isZh ? "知道了" : "Dismiss"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Body */}
          {mode === "detector" ? (
            <DetectorUI isLoadingGlobal={isLoading} isZh={isZh} locked={detectorLocked} canSeeSuspicious={!!ent?.canSeeSuspiciousSentences} />
          ) : mode === "humanizer" ? (
            <HumanizerUI locked={humanizerLocked} entitlement={ent} onUsageRefresh={refreshEnt} />
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
                            : copiedMessageId === m.id
                            ? "bg-[#0f0f0f] text-slate-200 border border-emerald-400/30 rounded-bl-sm shadow-[0_0_0_1px_rgba(52,211,153,0.18)]"
                            : "bg-[#0f0f0f] text-slate-200 border border-white/5 rounded-bl-sm shadow-sm",
                        ].join(" ")}
                      >
                        {m.stage === "assistant" ? (
                          <div className="mb-2 flex items-center justify-end">
                            <CopyButton text={m.content} onCopied={() => setCopiedMessageId(m.id)} className="bg-slate-950/80" />
                          </div>
                        ) : null}
                        {m.stage === "assistant" ? <AiFormattedText text={m.content} className="text-[14px] leading-relaxed" /> : m.content}
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
                        {isZh ? "浠婃棩璋冪敤闄愬埗:" : "Daily limit:"}{" "}
                        <span className="text-slate-300">
                          {ent.usedChatCountToday}/{ent.chatPerDay}
                        </span>
                      </span>
                      <button onClick={() => setPlanOpen(true)} className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2">
                        {isZh ? "鍗囩骇鏉冮檺" : "Upgrade Access"}
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
          openRedeemModal();
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
        success={redeemSuccess}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isZh={isZh}
        lang={lang}
        setLang={setLang}
        sessionExists={sessionExists}
        accountLabel={effectiveSession?.user?.email ?? effectiveSession?.user?.name ?? null}
        ent={ent}
        mode={mode}
        onOpenPlan={() => {
          refreshEnt();
          setPlanOpen(true);
        }}
        onOpenRedeem={() => {
          if (!sessionExists) return signIn();
          openRedeemModal();
        }}
        onSignOut={sessionExists ? () => signOut() : undefined}
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


