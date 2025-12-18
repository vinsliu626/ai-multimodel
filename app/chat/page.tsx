"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

type Role = "user" | "assistant";

type Message = {
  role: Role;
  content: string;
};

type Mode = "single" | "team" | "detector";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";
type Lang = "zh" | "en";

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type PillOption = {
  value: string;
  label: string;
};

type PillSelectProps = {
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/** 自定义椭圆下拉组件，替代原生 <select> */
function PillSelect({
  value,
  options,
  onChange,
  disabled,
  className = "",
}: PillSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  return (
    <div
      className={`relative ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50 focus:outline-none focus:ring-1 focus:ring-blue-500/70 focus:border-blue-500/70"
      >
        <span className="truncate">{selected.label}</span>
        <span className="ml-2 text-[10px] text-slate-400">⌄</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-full min-w-[160px] rounded-2xl border border-white/10 bg-slate-950 shadow-xl z-30 py-1">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                  active
                    ? "bg-blue-500/20 text-slate-50"
                    : "text-slate-200 hover:bg-slate-800",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** -------- Detector -------- */
type DetectorResult = {
  aiGenerated: number;
  humanAiRefined: number;
  humanWritten: number;
};

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function ResultRow({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-[12px] text-slate-200">{label}</span>
        </div>
        <span className="text-[12px] font-semibold text-slate-50">{Math.round(value)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-white/30" style={{ width: `${Math.round(value)}%` }} />
      </div>
    </div>
  );
}

function DetectorUI({
  isLoadingGlobal,
  isZh,
}: {
  isLoadingGlobal: boolean;
  isZh: boolean;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const words = useMemo(() => countWords(text), [text]);

  const englishWarning = useMemo(() => {
    if (!text.trim()) return null;
    if (hasNonEnglish(text)) return isZh ? "检测器仅支持英文文本。" : "Only English text is supported.";
    return null;
  }, [text, isZh]);

  const tooShort = useMemo(() => {
    if (!text.trim()) return false;
    return words < 40;
  }, [text, words]);

  async function detect() {
    if (loading || isLoadingGlobal) return;

    setError(null);
    setResult(null);

    const t = text.trim();
    if (!t) {
      setError(isZh ? "请粘贴英文文本开始分析。" : "Please paste text to begin analysis.");
      return;
    }
    if (countWords(t) < 40) {
      setError(isZh ? "至少需要 40 个英文单词。" : "To analyze text, add at least 40 words.");
      return;
    }
    if (hasNonEnglish(t)) {
      setError(isZh ? "检测器仅支持英文文本。" : "Only English text is supported.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai-detector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, lang: "en" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Detector API error: ${res.status}`);
      }

      const ai = clampPct(Number(data?.aiGenerated ?? data?.ai ?? 0));
      const humanAi = clampPct(Number(data?.humanAiRefined ?? data?.mixed ?? 0));
      const human = clampPct(Number(data?.humanWritten ?? data?.human ?? 0));

      const sum = ai + humanAi + human;
      if (sum !== 100 && sum > 0) {
        const scale = 100 / sum;
        setResult({
          aiGenerated: Math.round(ai * scale),
          humanAiRefined: Math.round(humanAi * scale),
          humanWritten: Math.round(human * scale),
        });
      } else {
        setResult({ aiGenerated: ai, humanAiRefined: humanAi, humanWritten: human });
      }
    } catch (e: any) {
      setError(e?.message || (isZh ? "分析失败。" : "Failed to analyze."));
    } finally {
      setLoading(false);
    }
  }

  const canDetect = !!text.trim() && !tooShort && !englishWarning && !loading && !isLoadingGlobal;

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        {/* 顶部 */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 shadow-md shadow-blue-500/30" />
            <div className="leading-tight">
              <p className="text-xs uppercase tracking-widest text-slate-400">AI Detector</p>
              <p className="text-sm font-semibold text-slate-50">
                {isZh ? "仅英文扫描" : "English-only scanning"}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            {words > 0 ? (isZh ? `单词数：${words}` : `${words} words`) : isZh ? "粘贴英文文本开始" : "Paste text to begin"}
          </div>
        </div>

        {/* 主体：左输入 + 右结果 */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* 左侧输入：改成暗色 + 蓝紫渐变边框 */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full rounded-3xl p-[1px] bg-gradient-to-r from-blue-500/60 via-purple-500/50 to-cyan-400/50">
              <div className="h-full rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-50">
                    {isZh ? "文本" : "Text"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {tooShort ? (isZh ? "至少 40 个英文单词" : "Add at least 40 words") : " "}
                  </p>
                </div>
              
              
                <div className="detector-scroll-area flex-1 overflow-y-auto">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      isZh ? "To analyze text, add at least 40 words." : "To analyze text, add at least 40 words."
                    }
                    className="w-full min-h-full resize-none overflow-hidden px-4 py-3 text-[14px] leading-6 bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>




                <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400">
                    {englishWarning ? (
                      <span className="text-amber-300">{englishWarning}</span>
                    ) : words > 0 ? (
                      <span>{isZh ? `单词数：${words}` : `${words} words`}</span>
                    ) : (
                      <span> </span>
                    )}
                  </div>

                  <button
                    onClick={detect}
                    disabled={!canDetect}
                    className="h-10 px-5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white text-sm font-semibold shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                  >
                    {loading ? (isZh ? "分析中…" : "Analyzing…") : isZh ? "Detect AI" : "Detect AI"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧结果：保持暗色高级 */}
          <div className="w-full lg:w-[420px] p-4 overflow-hidden">
            <div className="h-full rounded-3xl p-[1px] bg-gradient-to-b from-white/10 via-blue-500/20 to-purple-500/20">
              <div className="h-full rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-semibold text-slate-50">
                    {isZh ? "结果" : "Results"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {isZh
                      ? "分析完成后会在这里显示占比。"
                      : "A breakdown will appear here after scanning."}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
                  {error && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                      {error}
                    </div>
                  )}

                  {!error && !result && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-slate-300">
                      {isZh
                        ? "粘贴英文文本（40+ 单词），然后点击 Detect AI。"
                        : "Paste English text (40+ words) and click Detect AI."}
                    </div>
                  )}

                  {result && (
                    <div className="space-y-3">
                      <ResultRow
                        label={isZh ? "AI 生成" : "AI-generated"}
                        value={result.aiGenerated}
                        dot="bg-amber-400"
                      />
                      <ResultRow
                        label={isZh ? "人写 + AI 润色" : "Human-written & AI-refined"}
                        value={result.humanAiRefined}
                        dot="bg-sky-300"
                      />
                      <ResultRow
                        label={isZh ? "人写" : "Human-written"}
                        value={result.humanWritten}
                        dot="bg-slate-200"
                      />

                      <details className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <summary className="cursor-pointer text-[12px] text-slate-200 select-none">
                          {isZh ? "理解结果" : "Understanding your results"}
                        </summary>
                        <div className="mt-2 text-[11px] text-slate-400 leading-5">
                          {isZh
                            ? "这是概率估计，不是证明。建议把它当作参考信号。"
                            : "This is an estimate, not proof. Treat it as a signal."}
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-500">
                  {isZh ? "提示：此功能仅检测英文文本。" : "Tip: This detector is English-only."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部轻微光晕，增强“生动感” */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { data: session, status } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ✅ 语言切换必须保留（Detector 也要用这个）
  const [lang, setLang] = useState<Lang>("zh");
  const isZh = lang === "zh";

  const [mode, setMode] = useState<Mode>("single");
  const [modelKind, setModelKind] = useState<ModelKind>("fast");
  const [singleModelKey, setSingleModelKey] =
    useState<SingleModelKey>("groq_fast");

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState<string>("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);

  const zhPrompts = [
    "今天有什么可以帮到你？",
    "最近在忙什么项目？可以说说，我帮你拆一拆。",
    "试试：为大学生设计一个文档。",
    "或者：帮我写一份简历。",
    "想不想试试多模型一起给你出主意？",
  ];
  const enPrompts = [
    "What can I help you with today?",
    "Working on anything interesting recently?",
    "Try: Design a document for college students.",
    "Or: Help me write a resume that stands out.",
    "Let the multi-agent team brainstorm with you.",
  ];

  const [heroText, setHeroText] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [isDeletingHero, setIsDeletingHero] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadSessions() {
    try {
      setSessionsLoading(true);
      const res = await fetch("/api/chat/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err) {
      console.error("加载会话列表失败：", err);
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (mode === "detector") return;
    if (messages.length > 0) {
      if (heroText !== "") setHeroText("");
      return;
    }

    const phrases = isZh ? zhPrompts : enPrompts;
    const current = phrases[promptIndex % phrases.length];

    const typingSpeed = 80;
    const deletingSpeed = 50;
    const stayDuration = 1200;

    let timeout: NodeJS.Timeout;

    if (!isDeletingHero) {
      if (heroText.length < current.length) {
        timeout = setTimeout(() => {
          setHeroText(current.slice(0, heroText.length + 1));
        }, typingSpeed);
      } else {
        timeout = setTimeout(() => {
          setIsDeletingHero(true);
        }, stayDuration);
      }
    } else {
      if (heroText.length > 0) {
        timeout = setTimeout(() => {
          setHeroText(current.slice(0, heroText.length - 1));
        }, deletingSpeed);
      } else {
        setIsDeletingHero(false);
        setPromptIndex((prev) => (prev + 1) % phrases.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [heroText, isDeletingHero, promptIndex, isZh, messages.length, mode]);

  async function handleSelectSession(sessionId: string) {
    if (isLoading) return;
    setIsLoading(true);
    setMenuOpenId(null);

    try {
      const res = await fetch(`/api/chat/session/${sessionId}`);
      const data = await res.json();

      const msgs: Message[] = (data.messages ?? []).map(
        (m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })
      );

      setMessages(msgs);
      setChatSessionId(sessionId);
      setSidebarOpen(false);
      if (mode === "detector") setMode("single");
    } catch (err) {
      console.error("加载会话消息失败：", err);
    } finally {
      setIsLoading(false);
    }
  }

  function openDeleteConfirm(sessionId: string, title: string) {
    if (isLoading) return;
    setMenuOpenId(null);
    setDeleteTargetId(sessionId);
    setDeleteTargetTitle(title || (isZh ? "未命名会话" : "Untitled"));
    setShowDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    if (deleteLoading) return;
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
    setDeleteTargetTitle("");
  }

  async function confirmDeleteSession() {
    if (!deleteTargetId) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/chat/session/${deleteTargetId}`, {
        method: "DELETE",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok || data?.ok === false) {
        console.error("删除接口返回非 200：", res.status, data);
        alert(
          (isZh
            ? "删除会话失败，请稍后重试。"
            : "Failed to delete conversation.") +
            (data?.error ? "\n\n" + data.error : "")
        );
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== deleteTargetId));

      if (chatSessionId === deleteTargetId) {
        setChatSessionId(null);
        setMessages([]);
        setInput("");
        setHeroText("");
        setPromptIndex(0);
        setIsDeletingHero(false);
      }

      closeDeleteConfirm();
    } catch (err) {
      console.error("删除会话失败：", err);
      alert(isZh ? "删除失败，请稍后重试。" : "Failed to delete. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  }

  function openRenameModal(sessionId: string, currentTitle: string) {
    if (isLoading) return;
    setMenuOpenId(null);
    setRenameTargetId(sessionId);
    setRenameTitle(currentTitle || (isZh ? "未命名会话" : "Untitled"));
    setShowRenameModal(true);
  }

  function closeRenameModal() {
    if (renameLoading) return;
    setShowRenameModal(false);
    setRenameTargetId(null);
    setRenameTitle("");
  }

  async function confirmRenameSession() {
    if (!renameTargetId) return;
    const newTitle = renameTitle.trim();
    if (!newTitle) {
      alert(isZh ? "标题不能为空" : "Title cannot be empty");
      return;
    }

    setRenameLoading(true);
    try {
      const res = await fetch(`/api/chat/session/${renameTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok || data?.ok === false) {
        console.error("重命名接口返回非 200：", res.status, data);
        alert(
          (isZh
            ? "重命名会话失败，请稍后重试。"
            : "Failed to rename conversation.") +
            (data?.error ? "\n\n" + data.error : "")
        );
        return;
      }

      setSessions((prev) =>
        prev.map((s) => (s.id === renameTargetId ? { ...s, title: newTitle } : s))
      );

      closeRenameModal();
    } catch (err) {
      console.error("重命名会话失败：", err);
      alert(isZh ? "重命名失败，请稍后重试。" : "Rename failed, please try again.");
    } finally {
      setRenameLoading(false);
    }
  }

  function handleNewChat() {
    if (isLoading) return;
    setMessages([]);
    setInput("");
    setChatSessionId(null);
    setHeroText("");
    setPromptIndex(0);
    setIsDeletingHero(false);
    setMenuOpenId(null);
    setSidebarOpen(false);
    if (mode === "detector") setMode("single");
  }

  async function handleSend() {
    if (mode === "detector") return;
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

      const data = await res.json();
      const fullReply: string =
        data.reply ?? (isZh ? "AI 暂时没有返回内容。" : "No response from AI.");

      if (data.chatSessionId) {
        setChatSessionId(data.chatSessionId);
        loadSessions();
      }

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
              next[lastIndex] = { ...next[lastIndex], content: slice };
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
            (isZh
              ? "调用后端出错了，请稍后重试。\n\n错误信息："
              : "Backend error, please try again later.\n\nError: ") +
            (err instanceof Error ? err.message : String(err)),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mode === "detector") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const modeLabel = (() => {
    if (mode === "detector") return isZh ? "AI 检测器（英文）" : "AI Detector (English)";
    if (mode === "team") return isZh ? "AI 多智能体协作中" : "Multi-agent collaboration mode";
    if (singleModelKey === "hf_deepseek") return isZh ? "DeepSeek 单模型" : "DeepSeek single model";
    if (singleModelKey === "hf_kimi") return isZh ? "Kimi 单模型" : "Kimi single model";
    if (singleModelKey === "groq_quality") return isZh ? "Groq · 高质量" : "Groq · high quality";
    return isZh ? "Groq · 极速" : "Groq · ultra fast";
  })();

  const userInitial = session?.user?.name?.[0] || session?.user?.email?.[0] || "U";

  const modeOptions: PillOption[] = [
    { value: "single", label: isZh ? "单模型" : "Single model" },
    { value: "team", label: isZh ? "团队协作" : "Team / multi-agent" },
    { value: "detector", label: isZh ? "AI 检测器" : "AI Detector" },
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

  return (
    <main className="h-screen w-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
      <div className="h-full w-full border border-white/10 bg-white/5 shadow-[0_18px_60px_rgba(15,23,42,0.8)] backdrop-blur-xl flex">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

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
                <p className="text-xs uppercase tracking-widest text-slate-400">Multi-Model</p>
                <p className="text-sm font-semibold text-slate-50">{isZh ? "AI 工作台" : "AI Workspace"}</p>
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

          <div className="px-3 pt-3 pb-2">
            <div className="rounded-2xl bg-slate-900/80 border border-white/10 px-3 py-2 text-[11px] text-slate-300 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {isZh ? "运行模式" : "Mode"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
                  {mode === "single" ? (isZh ? "单模型" : "Single") : mode === "team" ? (isZh ? "多智能体" : "Multi") : isZh ? "检测器" : "Detector"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">{modeLabel}</p>
              <p className="mt-1 text-[10px] text-slate-500">{isZh ? "提示：按 ESC 可快速关闭" : "Tip: Press ESC to close"}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 space-y-1 mt-1 custom-scrollbar">
            {sessionsLoading && (
              <div className="px-3 py-2 text-xs text-slate-400">
                {isZh ? "正在加载历史会话…" : "Loading sessions…"}
              </div>
            )}

            {!sessionsLoading && sessions.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">
                {isZh ? (
                  <>
                    还没有保存的会话。
                    <br />
                    开始一次新的对话试试吧 👆
                  </>
                ) : (
                  <>
                    No conversations yet.
                    <br />
                    Start a new one 👆
                  </>
                )}
              </div>
            )}

            {sessions.map((s) => {
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

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId((prev) => (prev === s.id ? null : s.id));
                      }}
                      className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
                      title={isZh ? "更多操作" : "More actions"}
                    >
                      ⋯
                    </button>

                    {menuOpenId === s.id && (
                      <div
                        className="absolute right-0 top-7 z-20 w-32 rounded-2xl bg-slate-950 border border-white/10 shadow-lg py-1 text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-100" onClick={() => openRenameModal(s.id, s.title)}>
                          {isZh ? "重命名" : "Rename"}
                        </button>
                        <button className="w-full text-left px-3 py-1.5 hover:bg-red-600/10 text-red-400" onClick={() => openDeleteConfirm(s.id, s.title)}>
                          {isZh ? "删除" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-slate-950/60">
          <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-4 bg-slate-950/60">
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
                <h1 className="font-semibold text-sm text-slate-100">{isZh ? "多模型 AI 助手 · 聊天测试版" : "Multi-Model AI Assistant · Chat"}</h1>
                <p className="text-[11px] text-slate-400">Groq · DeepSeek · Kimi · Multi-Agent</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-2xl bg-slate-900/80 border border-white/10 shadow-sm">
                <div className="flex flex-col gap-1 text-[11px] min-w-[160px]">
                  <span className="text-slate-400">{isZh ? "运行模式" : "Mode"}</span>
                  <PillSelect
                    value={mode}
                    options={modeOptions}
                    onChange={(v) => {
                      const next = v as Mode;
                      setMode(next);
                      if (next === "detector") setIsLoading(false);
                    }}
                    disabled={isLoading}
                  />
                </div>

                <div className="h-8 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

                <div className="flex flex-col gap-1 text-[11px] min-w-[180px]">
                  <span className="text-slate-400">
                    {mode === "single" ? (isZh ? "单模型选择" : "Model") : mode === "team" ? (isZh ? "团队质量" : "Team quality") : isZh ? "检测语言" : "Language"}
                  </span>

                  {mode === "single" ? (
                    <PillSelect value={singleModelKey} options={singleModelOptions} onChange={(v) => setSingleModelKey(v as SingleModelKey)} disabled={isLoading} />
                  ) : mode === "team" ? (
                    <PillSelect value={modelKind} options={teamQualityOptions} onChange={(v) => setModelKind(v as ModelKind)} disabled={isLoading} />
                  ) : (
                    <div className="w-full rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50">
                      English only
                    </div>
                  )}
                </div>
              </div>

              {/* ✅ 语言切换：Detector 模式也必须保留 */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
                <span className="text-slate-300 mr-1">🌐</span>
                <button
                  onClick={() => setLang("zh")}
                  className={`px-2 py-0.5 rounded-full transition ${
                    isZh ? "bg-slate-100 text-slate-900 text-[11px] font-medium" : "text-slate-300 hover:text-white"
                  }`}
                >
                  中
                </button>
                <button
                  onClick={() => setLang("en")}
                  className={`px-2 py-0.5 rounded-full transition ${
                    !isZh ? "bg-slate-100 text-slate-900 text-[11px] font-medium" : "text-slate-300 hover:text-white"
                  }`}
                >
                  EN
                </button>
              </div>

              <div className="flex items-center gap-2">
                {status === "loading" ? (
                  <div className="h-8 w-8 rounded-full bg-slate-800 animate-pulse" />
                ) : session ? (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-xs font-semibold text-white shadow-md shadow-blue-500/40">
                      {userInitial.toUpperCase()}
                    </div>
                    <div className="hidden sm:flex flex-col text-[11px] leading-tight">
                      <span className="text-slate-100 truncate max-w-[120px]">{session.user?.name || session.user?.email}</span>
                      <button
                        onClick={() => signOut()}
                        className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                      >
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

          {mode === "detector" ? (
            <DetectorUI isLoadingGlobal={isLoading} isZh={isZh} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3 custom-scrollbar">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-sm">
                    <div className="mb-4 h-14 w-14 rounded-full bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 opacity-80 animate-pulse shadow-lg shadow-blue-500/40" />
                    <p className="min-h-[1.5em] text-base text-slate-100">
                      {heroText || (isZh ? "今天有什么可以帮到你？" : "What can I help you with today?")}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {isZh
                        ? "可以直接用自然语言描述你的想法，支持单模型 / 多智能体协作。"
                        : "Describe your idea in natural language. Single model and multi-agent modes are both supported."}
                    </p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap max-w-[80%] border backdrop-blur-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white border-blue-400/70 shadow-md shadow-blue-500/30"
                          : "bg-slate-900/80 text-slate-100 border-white/10"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {mode === "team"
                      ? isZh
                        ? "多模型团队正在协作思考中……"
                        : "Multi-agent team is thinking…"
                      : isZh
                      ? "模型正在思考中……"
                      : "Model is thinking…"}
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
              </div>
            </>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-xs rounded-2xl bg-slate-950 border border-white/10 shadow-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-50 mb-2">{isZh ? "删除会话？" : "Delete conversation?"}</h2>
            <p className="text-xs text-slate-400 mb-3 break-words">
              {isZh
                ? `确认要删除「${deleteTargetTitle}」这个会话吗？删除后将无法恢复。`
                : `Are you sure you want to delete “${deleteTargetTitle}”? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={closeDeleteConfirm}
                disabled={deleteLoading}
                className="px-3 py-1 rounded-full border border-white/15 bg-slate-900 text-slate-200 hover:border-slate-400 disabled:opacity-60"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                onClick={confirmDeleteSession}
                disabled={deleteLoading}
                className="px-3 py-1 rounded-full bg-red-500/90 text-white font-medium hover:bg-red-500 disabled:opacity-60"
              >
                {deleteLoading ? (isZh ? "删除中…" : "Deleting…") : isZh ? "删除" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-xs rounded-2xl bg-slate-950 border border-white/10 shadow-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-50 mb-2">{isZh ? "重命名会话" : "Rename conversation"}</h2>
            <input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70 focus:border-blue-500/70 mb-3"
              placeholder={isZh ? "输入新的会话标题" : "Enter new title"}
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={closeRenameModal}
                disabled={renameLoading}
                className="px-3 py-1 rounded-full border border-white/15 bg-slate-900 text-slate-200 hover:border-slate-400 disabled:opacity-60"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                onClick={confirmRenameSession}
                disabled={renameLoading}
                className="px-3 py-1 rounded-full bg-blue-500/90 text-white font-medium hover:bg-blue-500 disabled:opacity-60"
              >
                {renameLoading ? (isZh ? "保存中…" : "Saving…") : isZh ? "保存" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
