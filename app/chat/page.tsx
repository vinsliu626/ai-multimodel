"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

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

type PillOption = { value: string; label: string };

type PillSelectProps = {
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/** ===================== Billing / Entitlement ===================== */
type PlanId = "basic" | "pro" | "ultra" | "gift";
type UsageType = "detector_words_week" | "note_seconds_week" | "chat_count_day";

type Entitlement = {
  ok: true;
  plan: PlanId;
  unlimited: boolean;
  // limits
  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;

  // usage
  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedChatCountToday: number;

  // capabilities
  canSeeSuspiciousSentences: boolean;
};

function formatSecondsToHrs(sec: number) {
  const h = sec / 3600;
  if (h < 1) return `${Math.round((sec / 60) * 10) / 10}m`;
  return `${Math.round(h * 10) / 10}h`;
}

function planLabel(plan: PlanId, isZh: boolean) {
  if (plan === "gift") return isZh ? "礼包无限制" : "Gift Unlimited";
  if (plan === "ultra") return "Ultra Pro";
  if (plan === "pro") return "Pro";
  return isZh ? "Basic（免费）" : "Basic (Free)";
}

/** ===================== UI: PillSelect ===================== */
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

/** ===================== Plan Modal ===================== */
function PlanModal({
  open,
  onClose,
  isZh,
  effectiveSessionExists,
  ent,
  onOpenRedeem,
  onManageBilling,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  effectiveSessionExists: boolean;
  ent: Entitlement | null;
  onOpenRedeem: () => void;
  onManageBilling: (plan: "pro" | "ultra") => void;
}) {
  if (!open) return null;

  const cur = ent?.plan ?? "basic";

  const Card = ({
    title,
    price,
    badge,
    active,
    items,
    cta,
    onClick,
  }: {
    title: string;
    price: string;
    badge?: string;
    active?: boolean;
    items: string[];
    cta: string;
    onClick: () => void;
  }) => (
    <div
      className={[
        "rounded-3xl border p-4",
        active
          ? "border-blue-400/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-50">{title}</p>
            {badge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/20">
                {badge}
              </span>
            )}
            {active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-200 border border-blue-400/20">
                {isZh ? "当前" : "Current"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-slate-300">{price}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-[12px] text-slate-200">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-300">✓</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        className={[
          "mt-4 w-full h-10 rounded-2xl font-semibold text-sm transition",
          active
            ? "bg-white/10 text-slate-200 border border-white/10 hover:bg-white/15"
            : "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30 hover:brightness-110",
        ].join(" ")}
      >
        {cta}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-50">
              {isZh ? "选择套餐" : "Choose a plan"}
            </p>
            <p className="text-[12px] text-slate-400 mt-1">
              {isZh
                ? "Basic 有额度限制；Pro/Ultra 解锁更高额度；礼包码可永久无限制。"
                : "Basic has limits. Pro/Ultra increases limits. Gift code unlocks unlimited."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {/* current usage */}
          {effectiveSessionExists && ent && (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] text-slate-300">
                    {isZh ? "当前套餐：" : "Current plan: "}
                    <span className="font-semibold text-slate-50">{planLabel(ent.plan, isZh)}</span>
                    {ent.unlimited && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/20">
                        {isZh ? "无限制" : "Unlimited"}
                      </span>
                    )}
                  </p>
                  {!ent.unlimited && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isZh ? "本周检测：" : "Detector this week: "}
                      <span className="text-slate-200">
                        {ent.usedDetectorWordsThisWeek}/{ent.detectorWordsPerWeek}
                      </span>
                      {" · "}
                      {isZh ? "本周笔记：" : "Notes this week: "}
                      <span className="text-slate-200">
                        {formatSecondsToHrs(ent.usedNoteSecondsThisWeek)}/
                        {formatSecondsToHrs(ent.noteSecondsPerWeek ?? 0)}
                      </span>
                      {" · "}
                      {isZh ? "今日聊天：" : "Chat today: "}
                      <span className="text-slate-200">
                        {ent.usedChatCountToday}/{ent.chatPerDay}
                      </span>
                    </p>
                  )}
                </div>

                <button
                  onClick={onOpenRedeem}
                  className="h-9 px-4 rounded-2xl bg-white/5 border border-white/10 text-slate-100 text-[12px] font-semibold hover:bg-white/10 transition"
                >
                  {isZh ? "输入礼包码" : "Redeem code"}
                </button>
              </div>
            </div>
          )}

          {!effectiveSessionExists && (
            <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200">
              {isZh
                ? "你还没登录：只能聊天，无法使用检测器/笔记，也不会保存记忆。登录后可开启套餐与额度。"
                : "You are not signed in: chat only. Detector/Notes are locked and memory won't be saved. Sign in to unlock plans & quotas."}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title={isZh ? "Basic（免费）" : "Basic (Free)"}
              price={isZh ? "￥0 / 月" : "$0 / mo"}
              active={cur === "basic"}
              items={[
                isZh ? "AI 检测器：5000 词/周" : "AI Detector: 5000 words/week",
                isZh ? "AI 笔记：2 小时/周" : "AI Notes: 2 hours/week",
                isZh ? "多模型聊天：10 次/天" : "Multi-model chat: 10/day",
                isZh ? "不含可疑句子列表" : "No suspicious sentence list",
              ]}
              cta={cur === "basic" ? (isZh ? "已在使用" : "Using") : (isZh ? "使用 Basic" : "Use Basic")}
              onClick={() => {
                if (!effectiveSessionExists) return signIn();
                onClose();
              }}
            />

            <Card
              title="Pro"
              price={isZh ? "￥5.99 / 月" : "$5.99 / mo"}
              badge={isZh ? "推荐" : "Popular"}
              active={cur === "pro"}
              items={[
                isZh ? "AI 检测器：15000 词/周" : "AI Detector: 15000 words/week",
                isZh ? "AI 笔记：15 小时/周" : "AI Notes: 15 hours/week",
                isZh ? "可疑句子列表（商用体验）" : "Suspicious sentence list",
                isZh ? "多模型聊天：无限制" : "Multi-model chat: unlimited",
              ]}
              cta={
                cur === "pro"
                  ? (isZh ? "管理订阅" : "Manage")
                  : effectiveSessionExists
                  ? (isZh ? "升级到 Pro" : "Upgrade to Pro")
                  : (isZh ? "登录后升级" : "Sign in to upgrade")
              }
              onClick={() => {
                if (!effectiveSessionExists) return signIn();
                onManageBilling("pro");
              }}
            />

            <Card
              title="Ultra Pro"
              price={isZh ? "￥7.99 / 月" : "$7.99 / mo"}
              active={cur === "ultra"}
              items={[
                isZh ? "AI 检测器：无限制" : "AI Detector: unlimited",
                isZh ? "AI 笔记：无限制" : "AI Notes: unlimited",
                isZh ? "多模型聊天：无限制" : "Multi-model chat: unlimited",
                isZh ? "所有功能解锁" : "Everything unlocked",
              ]}
              cta={
                cur === "ultra"
                  ? (isZh ? "管理订阅" : "Manage")
                  : effectiveSessionExists
                  ? (isZh ? "升级到 Ultra" : "Upgrade to Ultra")
                  : (isZh ? "登录后升级" : "Sign in to upgrade")
              }
              onClick={() => {
                if (!effectiveSessionExists) return signIn();
                onManageBilling("ultra");
              }}
            />
          </div>

          <div className="mt-4 text-[11px] text-slate-500">
            {isZh
              ? "提示：付款用 Stripe 最省事；礼包码适合早期内测/推广。"
              : "Tip: Stripe is easiest for billing. Gift codes are great for early access & partnerships."}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===================== Redeem Modal ===================== */
function RedeemModal({
  open,
  onClose,
  isZh,
  onRedeem,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  onRedeem: (code: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-50">
            {isZh ? "输入礼包码" : "Redeem code"}
          </p>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[12px] text-slate-400">
            {isZh ? "输入有效礼包码后，将永久解锁无限制使用。" : "A valid code unlocks unlimited access permanently."}
          </p>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={isZh ? "例如：EARLY-ACCESS-2026" : "e.g. EARLY-ACCESS-2026"}
            className="mt-3 w-full h-11 rounded-2xl bg-slate-900 border border-white/15 px-4 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70 focus:border-blue-500/70"
          />

          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 h-10 rounded-2xl bg-white/5 border border-white/10 text-slate-200 font-semibold hover:bg-white/10 transition disabled:opacity-60"
            >
              {isZh ? "取消" : "Cancel"}
            </button>
            <button
              onClick={() => onRedeem(code.trim())}
              disabled={loading || !code.trim()}
              className="flex-1 h-10 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white font-semibold shadow-md shadow-blue-500/30 hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? (isZh ? "验证中…" : "Checking…") : (isZh ? "兑换" : "Redeem")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===================== Entitlement Hook ===================== */
function useEntitlement(effectiveSessionExists: boolean) {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [loadingEnt, setLoadingEnt] = useState(false);

  async function refresh() {
    if (!effectiveSessionExists) {
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
  }, [effectiveSessionExists]);

  return { ent, loadingEnt, refresh, setEnt };
}

/** ===================== Detector helpers ===================== */
type DetectorResult = { aiGenerated: number; humanAiRefined: number; humanWritten: number };
type DetectorHighlight = { start: number; end: number; type?: string; label?: string; severity?: number; phrase?: string };
type DetectorSentence = { text: string; start: number; end: number; aiScore: number; reasons: string[] };

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}
function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function approxWordCountBySlice(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function buildCoverageHighlightsFromSentences(
  fullText: string,
  sentences: DetectorSentence[],
  targetPct: number,
  opts?: { minSentenceScore?: number; contextSentences?: number; gapChars?: number; minBlockChars?: number }
): DetectorHighlight[] {
  const minSentenceScore = opts?.minSentenceScore ?? 35;
  const contextSentences = opts?.contextSentences ?? 1;
  const gapChars = opts?.gapChars ?? 40;
  const minBlockChars = opts?.minBlockChars ?? 20;

  const clean = (sentences || [])
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (!fullText || clean.length === 0) return [];

  const totalWords = countWords(fullText);
  const wantWords = Math.max(1, Math.round(totalWords * (clampPct(targetPct) / 100)));

  const ranked = clean
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => (b.s.aiScore ?? 0) - (a.s.aiScore ?? 0));

  const picked = new Set<number>();
  let pickedWords = 0;

  for (const item of ranked) {
    const score = Number(item.s.aiScore ?? 0);
    if (score < minSentenceScore) break;

    const slice = fullText.slice(item.s.start, item.s.end);
    const w = approxWordCountBySlice(slice);

    picked.add(item.idx);
    pickedWords += w;

    if (pickedWords >= wantWords) break;
  }

  if (pickedWords < wantWords) {
    for (const item of ranked) {
      if (picked.has(item.idx)) continue;
      const slice = fullText.slice(item.s.start, item.s.end);
      const w = approxWordCountBySlice(slice);
      picked.add(item.idx);
      pickedWords += w;
      if (pickedWords >= wantWords) break;
    }
  }

  if (picked.size === 0) return [];

  const pickedIdx = Array.from(picked).sort((a, b) => a - b);

  type Block = { i0: number; i1: number; maxScore: number };
  const blocks: Block[] = [];
  let cur: Block | null = null;

  for (const idx of pickedIdx) {
    if (!cur) {
      cur = { i0: idx, i1: idx, maxScore: clean[idx].aiScore ?? 0 };
      continue;
    }
    const prevEnd = clean[cur.i1].end;
    const nextStart = clean[idx].start;
    const closeEnough = nextStart - prevEnd <= gapChars;

    if (closeEnough) {
      cur.i1 = idx;
      cur.maxScore = Math.max(cur.maxScore, clean[idx].aiScore ?? 0);
    } else {
      blocks.push(cur);
      cur = { i0: idx, i1: idx, maxScore: clean[idx].aiScore ?? 0 };
    }
  }
  if (cur) blocks.push(cur);

  const expanded = blocks.map((b) => {
    const i0 = Math.max(0, b.i0 - contextSentences);
    const i1 = Math.min(clean.length - 1, b.i1 + contextSentences);
    return { start: clean[i0].start, end: clean[i1].end, maxScore: b.maxScore };
  });

  const results: DetectorHighlight[] = expanded
    .map((b) => {
      const s = Math.max(0, Math.min(fullText.length, b.start));
      const e = Math.max(0, Math.min(fullText.length, b.end));
      return {
        start: s,
        end: e,
        type: "block",
        label: `AI-like block (max ${Math.round(b.maxScore)}%)`,
        severity: Math.max(0.1, Math.min(1, (b.maxScore ?? 0) / 100)),
      };
    })
    .filter((h) => h.end - h.start >= minBlockChars)
    .sort((a, b) => a.start - b.start);

  const merged: DetectorHighlight[] = [];
  for (const h of results) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      last.severity = Math.max(last.severity ?? 0, h.severity ?? 0);
    } else {
      merged.push({ ...h });
    }
  }

  return merged;
}

function renderHighlightLayer(text: string, highlights: DetectorHighlight[]) {
  if (!text) return null;
  const ghost = (s: string) => s.replace(/\n/g, "\n\u200b");

  if (!highlights || highlights.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{ghost(text)}</span>;
  }

  const sorted = [...highlights]
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start)
    .map((h) => ({
      ...h,
      start: Math.max(0, Math.min(text.length, h.start)),
      end: Math.max(0, Math.min(text.length, h.end)),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: DetectorHighlight[] = [];
  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && h.start <= (last.end ?? 0)) last.end = Math.max(last.end ?? 0, h.end);
    else merged.push({ ...h });
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  merged.forEach((h, idx) => {
    const s = h.start!;
    const e = h.end!;
    if (cursor < s) nodes.push(<span key={`t-${idx}-a`}>{ghost(text.slice(cursor, s))}</span>);
    nodes.push(
      <mark
        key={`t-${idx}-m`}
        className="rounded px-0.5 py-[1px] bg-amber-300/85 text-slate-950"
        title={h.label || "AI-like"}
      >
        {ghost(text.slice(s, e))}
      </mark>
    );
    cursor = e;
  });

  if (cursor < text.length) nodes.push(<span key="tail">{ghost(text.slice(cursor))}</span>);
  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}

function HighlightEditor({
  value,
  onChange,
  highlights,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  highlights: DetectorHighlight[];
  placeholder: string;
  disabled?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);

  function syncScroll() {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer) return;
    layer.scrollTop = ta.scrollTop;
    layer.scrollLeft = ta.scrollLeft;
  }

  React.useLayoutEffect(() => {
    syncScroll();
  }, [value, highlights]);

  const sharedTextStyle = "px-4 py-3 text-[14px] leading-6 whitespace-pre-wrap break-words font-sans";

  return (
    <div className="relative h-full w-full rounded-2xl border border-white/10 bg-slate-950/30 overflow-hidden">
      <div
        ref={layerRef}
        className={["absolute inset-0", "overflow-auto scrollbar-none", sharedTextStyle, "text-slate-100", "pointer-events-none"].join(" ")}
      >
        {value ? renderHighlightLayer(value, highlights) : <span className="text-slate-500">{placeholder}</span>}
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          "absolute inset-0 w-full h-full resize-none",
          "overflow-auto purple-scrollbar scroll-stable",
          sharedTextStyle,
          "bg-transparent text-transparent caret-white",
          "placeholder:text-slate-500",
          "selection:bg-blue-500/35",
          "focus:outline-none",
        ].join(" ")}
        spellCheck={false}
      />
    </div>
  );
}

function ResultRow({ label, value, dot }: { label: string; value: number; dot: string }) {
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

/** ===================== Detector UI ===================== */
function DetectorUI({
  isLoadingGlobal,
  isZh,
  locked,
  canSeeSuspicious,
}: {
  isLoadingGlobal: boolean;
  isZh: boolean;
  locked: boolean;
  canSeeSuspicious: boolean;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<DetectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [highlights, setHighlights] = useState<DetectorHighlight[]>([]);
  const [sentences, setSentences] = useState<DetectorSentence[]>([]);

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
    if (locked) {
      setError(isZh ? "请先登录后使用 AI 检测器。" : "Please sign in to use AI Detector.");
      return;
    }
    if (loading || isLoadingGlobal) return;

    setError(null);
    setResult(null);
    setHighlights([]);
    setSentences([]);

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
      const normalized =
        sum !== 100 && sum > 0
          ? {
              aiGenerated: Math.round(ai * (100 / sum)),
              humanAiRefined: Math.round(humanAi * (100 / sum)),
              humanWritten: Math.round(human * (100 / sum)),
            }
          : { aiGenerated: ai, humanAiRefined: humanAi, humanWritten: human };

      setResult(normalized);

      const rawSentences: DetectorSentence[] = Array.isArray(data?.sentences) ? data.sentences : [];
      setSentences(rawSentences);

      const finalHighlights = buildCoverageHighlightsFromSentences(t, rawSentences, normalized.aiGenerated, {
        minSentenceScore: 35,
        contextSentences: 1,
        gapChars: 60,
        minBlockChars: 20,
      });

      setHighlights(finalHighlights);
    } catch (e: any) {
      setError(e?.message || (isZh ? "分析失败。" : "Failed to analyze."));
    } finally {
      setLoading(false);
    }
  }

  const canDetect = !!text.trim() && !tooShort && !englishWarning && !loading && !isLoadingGlobal && !locked;

  const suspiciousSentences = useMemo(() => {
    const arr = sentences
      .slice()
      .filter((s) => typeof s.aiScore === "number" && s.text?.trim())
      .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));

    const base = result?.aiGenerated ?? 0;
    const threshold = base >= 80 ? 35 : base >= 60 ? 40 : base >= 40 ? 45 : 50;
    const filtered = arr.filter((s) => (s.aiScore ?? 0) >= threshold).slice(0, 40);
    if (filtered.length === 0) return arr.slice(0, 20);
    return filtered;
  }, [sentences, result?.aiGenerated]);

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 shadow-md shadow-blue-500/30" />
            <div className="leading-tight">
              <p className="text-xs uppercase tracking-widest text-slate-400">AI Detector</p>
              <p className="text-sm font-semibold text-slate-50">
                {isZh ? "左侧原文高亮 · 右侧结果" : "Inline highlight (left) · Results (right)"}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            {words > 0 ? (isZh ? `单词数：${words}` : `${words} words`) : isZh ? "粘贴英文文本开始" : "Paste text to begin"}
          </div>
        </div>

        {locked && (
          <div className="px-4 pt-3">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              {isZh ? "请先登录后使用 AI 检测器（Basic 有每周额度）。" : "Sign in to use AI Detector (Basic has weekly quota)."}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full rounded-3xl p-[1px] bg-gradient-to-r from-blue-500/60 via-purple-500/50 to-cyan-400/50">
              <div className="h-full rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-50">{isZh ? "文本" : "Text"}</p>
                    <p className="text-[11px] text-slate-400">{tooShort ? (isZh ? "至少 40 个英文单词" : "Add at least 40 words") : " "}</p>
                  </div>

                  <button
                    onClick={detect}
                    disabled={!canDetect}
                    className="h-10 px-5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white text-sm font-semibold shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                  >
                    {loading ? (isZh ? "分析中…" : "Analyzing…") : "Detect AI"}
                  </button>
                </div>

                <div className="px-4 py-3">
                  {englishWarning && (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
                      {englishWarning}
                    </div>
                  )}
                  {error && (
                    <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden px-4 pb-4">
                  <HighlightEditor
                    value={text}
                    onChange={(v) => setText(v)}
                    highlights={result ? highlights : []}
                    placeholder="To analyze text, add at least 40 words."
                    disabled={loading || isLoadingGlobal}
                  />
                </div>

                <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>{words > 0 ? (isZh ? `单词数：${words}` : `${words} words`) : " "}</span>
                  <span className="text-slate-500">{isZh ? "高亮覆盖比例会跟随整体 AI%" : "Highlight coverage follows overall AI%"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[420px] p-4 overflow-hidden">
            <div className="h-full rounded-3xl p-[1px] bg-gradient-to-b from-white/10 via-blue-500/20 to-purple-500/20">
              <div className="h-full rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-semibold text-slate-50">{isZh ? "结果" : "Results"}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{isZh ? "右侧显示占比与可疑句子列表" : "Breakdown + suspicious sentences"}</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-3 space-y-1 mt-1">
                  {!result && !error && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-slate-300">
                      {isZh ? "粘贴英文文本（40+ 单词），点击 Detect AI。" : "Paste English text (40+ words) and click Detect AI."}
                    </div>
                  )}

                  {result && (
                    <>
                      <div className="space-y-3">
                        <ResultRow label={isZh ? "AI 生成" : "AI-generated"} value={result.aiGenerated} dot="bg-amber-400" />
                        <ResultRow label={isZh ? "人写 + AI 润色" : "Human-written & AI-refined"} value={result.humanAiRefined} dot="bg-sky-300" />
                        <ResultRow label={isZh ? "人写" : "Human-written"} value={result.humanWritten} dot="bg-slate-200" />
                      </div>

                      {!canSeeSuspicious ? (
                        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
                          {isZh ? "可疑句子列表仅 Pro/Ultra 或礼包用户可见。" : "Suspicious sentence list is available for Pro/Ultra or Gift users."}
                        </div>
                      ) : (
                        <details className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                          <summary className="cursor-pointer text-[12px] text-slate-200 select-none">
                            {isZh ? `可疑句子（${suspiciousSentences.length}）` : `Suspicious sentences (${suspiciousSentences.length})`}
                          </summary>

                          <div className="mt-3 space-y-2">
                            {suspiciousSentences.map((s, i) => (
                              <div key={i} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-300">
                                    {isZh ? "AI 概率" : "AI"}:{" "}
                                    <span className="font-semibold text-amber-200">{Math.round(s.aiScore)}%</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {Array.isArray(s.reasons) ? s.reasons.join(" · ") : ""}
                                  </span>
                                </div>
                                <div className="mt-1 text-[12px] text-slate-100 leading-5">{s.text}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      <div className="text-[11px] text-slate-500">{isZh ? `高亮片段数：${highlights.length}` : `Highlight spans: ${highlights.length}`}</div>
                    </>
                  )}
                </div>

                <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-500">
                  {isZh ? "提示：此功能仅检测英文文本。" : "Tip: This detector is English-only."}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
      </div>
    </div>
  );
}

/** ===================== AI Note UI ===================== */
type NoteTab = "upload" | "record" | "text";

function NoteUI({
  isLoadingGlobal,
  isZh,
  locked,
}: {
  isLoadingGlobal: boolean;
  isZh: boolean;
  locked: boolean;
}) {
  const [tab, setTab] = useState<NoteTab>("upload");

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recordBlob, setRecordBlob] = useState<Blob | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const timerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const canGenerate = useMemo(() => {
    if (locked) return false;
    if (loading || isLoadingGlobal) return false;
    if (tab === "upload") return !!file;
    if (tab === "record") return !!recordBlob;
    return text.trim().length > 0;
  }, [tab, file, recordBlob, text, loading, isLoadingGlobal, locked]);

  function resetAll() {
    setError(null);
    setResult("");
  }

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI 笔记（Basic 有每周额度）。" : "Please sign in to use AI Notes.");
      return;
    }
    resetAll();
    setRecordBlob(null);
    setRecordSecs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setRecordBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setRecording(true);

      timerRef.current = window.setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    } catch (e: any) {
      setError(e?.message || (isZh ? "无法打开麦克风权限（或浏览器不支持录音）。" : "Cannot access microphone (or browser unsupported)."));
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    try {
      mr.stop();
    } catch {}
    setRecording(false);
  }

  function onPickFile(f: File | null) {
    resetAll();
    if (!f) {
      setFile(null);
      return;
    }

    const name = f.name.toLowerCase();
    const okExt =
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".m4a") ||
      name.endsWith(".mp4") ||
      name.endsWith(".webm") ||
      name.endsWith(".ogg") ||
      name.endsWith(".aac") ||
      name.endsWith(".flac");

    const okMime = !f.type || f.type.startsWith("audio/") || f.type === "video/mp4";

    if (!okExt || !okMime) {
      setError(isZh ? "仅支持常见音频格式：mp3 / wav / m4a / mp4 / webm / ogg / aac / flac" : "Supported: mp3 / wav / m4a / mp4 / webm / ogg / aac / flac");
      setFile(null);
      return;
    }

    setFile(f);
  }

  async function generateNotes() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI 笔记。" : "Please sign in to use AI Notes.");
      return;
    }
    if (!canGenerate) return;

    setLoading(true);
    setError(null);
    setResult("");

    try {
      if (tab === "text") {
        const res = await fetch("/api/ai-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputType: "text", text: text.trim() }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) throw new Error(data?.error || `AI Note API error: ${res.status}`);
        setResult(String(data?.note ?? data?.result ?? ""));
      } else {
        const fd = new FormData();
        fd.append("inputType", tab);

        if (tab === "upload") {
          if (!file) throw new Error("Missing file");
          fd.append("file", file, file.name);
        } else {
          if (!recordBlob) throw new Error("Missing recording");
          const ext = recordBlob.type.includes("ogg") ? "ogg" : "webm";
          const recFile = new File([recordBlob], `recording.${ext}`, { type: recordBlob.type || "audio/webm" });
          fd.append("file", recFile, recFile.name);
        }

        const res = await fetch("/api/ai-note", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) throw new Error(data?.error || `AI Note API error: ${res.status}`);
        setResult(String(data?.note ?? data?.result ?? ""));
      }
    } catch (e: any) {
      setError(e?.message || (isZh ? "生成失败。" : "Failed to generate notes."));
    } finally {
      setLoading(false);
    }
  }

  const tabBtn = (k: NoteTab, label: string) => {
    const active = tab === k;
    return (
      <button
        type="button"
        onClick={() => {
          setTab(k);
          resetAll();
        }}
        className={[
          "h-10 px-5 rounded-full text-sm font-semibold transition",
          active
            ? "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30"
            : "bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">{isZh ? "AI 笔记助手" : "AI Note Assistant"}</h2>
          <p className="mt-2 text-sm text-slate-300">{isZh ? "固定三模型协作：音频/录音转文字后，再生成结构化笔记。" : "Always uses team mode: ASR → structured notes."}</p>
          {locked && (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              {isZh ? "请先登录后使用 AI 笔记（Basic 有每周额度）。" : "Sign in to use AI Notes (Basic has weekly quota)."}
            </div>
          )}
        </div>

        {error && (
          <div className="px-6 pt-4">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>
          </div>
        )}

        <div className="flex-1 overflow-hidden p-4">
          <div className="h-full rounded-3xl p-[1px] bg-gradient-to-r from-blue-500/50 via-purple-500/40 to-cyan-400/40">
            <div className="h-full rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
              <div className="px-4 py-4 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {tabBtn("upload", isZh ? "上传" : "Upload")}
                  {tabBtn("record", isZh ? "录音" : "Record")}
                  {tabBtn("text", isZh ? "文本" : "Text")}
                </div>

                <button
                  onClick={generateNotes}
                  disabled={!canGenerate}
                  className="h-10 px-5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white text-sm font-semibold shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                >
                  {loading ? (isZh ? "生成中…" : "Generating…") : isZh ? "生成笔记" : "Generate notes"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
                <div className="mx-auto max-w-3xl">
                  <div className="text-center">
                    <div className="mx-auto h-14 w-14 rounded-3xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 opacity-90 shadow-lg shadow-blue-500/30 flex items-center justify-center">
                      <span className="text-white text-2xl">📝</span>
                    </div>
                    <p className="mt-4 text-lg font-semibold text-slate-50">
                      {tab === "upload"
                        ? isZh
                          ? "上传音频（多格式），生成学习笔记"
                          : "Upload audio (multi-format) to generate notes"
                        : tab === "record"
                        ? isZh
                          ? "浏览器录音，生成学习笔记"
                          : "Record in browser to generate notes"
                        : isZh
                        ? "粘贴文字内容，生成学习笔记"
                        : "Paste text to generate notes"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{isZh ? "输出自动结构化：要点 / 术语 / 结论 / 复习清单" : "Structured output: key points, terms, summary, review list"}</p>
                  </div>

                  <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
                    {tab === "upload" && (
                      <div className="space-y-3">
                        <p className="text-[12px] text-slate-300">{isZh ? "支持：mp3 / wav / m4a / mp4 / webm / ogg / aac / flac" : "Supported: mp3 / wav / m4a / mp4 / webm / ogg / aac / flac"}</p>
                        <input
                          type="file"
                          accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.aac,.flac"
                          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold file:bg-white/10 file:text-slate-100 hover:file:bg-white/15"
                          disabled={loading || isLoadingGlobal}
                        />
                        {file && (
                          <div className="text-[12px] text-slate-200">
                            {isZh ? "已选择：" : "Selected:"} <span className="font-semibold">{file.name}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "record" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-[12px] text-slate-300">
                            {isZh ? "录音时长：" : "Duration:"} <span className="font-semibold text-slate-100">{recordSecs}s</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {!recording ? (
                              <button
                                onClick={startRecording}
                                disabled={loading || isLoadingGlobal || locked}
                                className="h-10 px-5 rounded-full bg-white/10 text-slate-100 border border-white/10 hover:bg-white/15 transition font-semibold disabled:opacity-60"
                              >
                                {isZh ? "开始录音" : "Start"}
                              </button>
                            ) : (
                              <button onClick={stopRecording} className="h-10 px-5 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition font-semibold">
                                {isZh ? "停止" : "Stop"}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-[12px] text-slate-300">
                          {recordBlob ? (isZh ? "已录音完成，可直接生成笔记。" : "Recording ready. You can generate notes now.") : isZh ? "点击开始录音，结束后自动保存。" : "Click Start. When you stop, it will be saved automatically."}
                        </div>
                      </div>
                    )}

                    {tab === "text" && (
                      <div className="space-y-3">
                        <textarea
                          value={text}
                          onChange={(e) => {
                            resetAll();
                            setText(e.target.value);
                          }}
                          placeholder={isZh ? "粘贴课堂/会议文字稿..." : "Paste transcript/notes here..."}
                          className="w-full h-40 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                          disabled={loading || isLoadingGlobal || locked}
                        />
                        <p className="text-[11px] text-slate-400">{isZh ? "建议：越完整越好（可包含时间点、说话人、章节标题）。" : "Tip: fuller transcript yields better notes."}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-50">{isZh ? "生成的笔记" : "Generated notes"}</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (!result) return;
                          navigator.clipboard?.writeText(result).catch(() => {});
                        }}
                        className="text-[11px] text-slate-300 hover:text-slate-100 underline underline-offset-4"
                      >
                        {isZh ? "复制" : "Copy"}
                      </button>
                    </div>

                    <div className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-slate-100 min-h-[120px]">
                      {result ? <>{result}</> : <span className="text-slate-500">{isZh ? "生成后会在这里显示结构化笔记。" : "Your structured notes will appear here."}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===================== Main Page ===================== */
export default function ChatPage() {
  const { data: session, status } = useSession();
  const sessionExists = !!session;

   // ✅ DEV 假登录（只影响前端显示/交互 gating）
  const devMode =
    process.env.NEXT_PUBLIC_DEV_MODE === "true" &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const effectiveSessionExists = sessionExists || devMode;

  const effectiveSession =
    session ??
    (devMode
      ? ({
          user: { name: "Developers", email: "dev@local" },
        } as any)
      : null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [lang, setLang] = useState<Lang>("zh");
  const isZh = lang === "zh";

  const [mode, setMode] = useState<Mode>("single");
  const [modelKind, setModelKind] = useState<ModelKind>("fast");
  const [singleModelKey, setSingleModelKey] = useState<SingleModelKey>("groq_fast");

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

  // Billing UI
  const [planOpen, setPlanOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const { ent, refresh: refreshEnt } = useEntitlement(sessionExists);

  // login gating: detector/note locked when not signed in
  const detectorLocked = !effectiveSessionExists;
  const noteLocked = !effectiveSessionExists;


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      console.error("加载会话列表失败：", err);
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
    setMenuOpenId(null);

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
      if (mode === "detector" || mode === "note") setMode("single");
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
    setMenuOpenId(null);
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

      const data = await res.json().catch(() => ({}));
      const fullReply: string = data.reply ?? (isZh ? "AI 暂时没有返回内容。" : "No response from AI.");

      // ✅ 未登录不保存 sessionId
      if (sessionExists && data.chatSessionId) {
        setChatSessionId(data.chatSessionId);
        loadSessions();
      }

      // ✅ 刷新额度（聊天计数）
      if (sessionExists) refreshEnt();

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
      console.error("调用 /api/chat 出错：", err);
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

  const userInitial = effectiveSession?.user?.name?.[0] || session?.user?.email?.[0] || "U";

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
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `Redeem error: ${res.status}`);
      setRedeemOpen(false);
      await refreshEnt();
    } catch (e: any) {
      setRedeemError(e?.message || (isZh ? "兑换失败" : "Redeem failed"));
    } finally {
      setRedeemLoading(false);
    }
  }

  // 这里你之后接 Stripe：创建 checkout session / customer portal
  async function manageBilling(plan: "pro" | "ultra") {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      alert(data?.error || "Failed to create checkout session");
      return;
    }
    window.location.href = data.url;
  }




  return (
    <main className="h-screen w-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden">
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

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 space-y-1 mt-1 custom-scrollbar">
            {!effectiveSessionExists && (
              <div className="px-3 py-3 text-xs text-slate-400">
                {isZh ? "未登录：不会保存历史会话。" : "Not signed in: conversations are not saved."}
              </div>
            )}

            {effectiveSessionExists && sessionsLoading && (<div className="px-3 py-2 text-xs text-slate-400">{isZh ? "正在加载历史会话…" : "Loading sessions…"}</div>)}

            {effectiveSessionExists && !sessionsLoading && sessions.length === 0 && (
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


            {effectiveSessionExists &&
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

            {/* Center: Plan pill (你要的“屏幕中上方美观”入口) */}
            <div className="hidden md:flex items-center justify-center flex-1">
              <button
                onClick={() => setPlanOpen(true)}
                className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition shadow-sm flex items-center gap-2"
              >
                <span className="text-[11px] text-slate-300">{isZh ? "套餐" : "Plan"}</span>
                <span className="text-[12px] font-semibold text-slate-50">
                  {planLabel(ent?.plan ?? "basic", isZh)}
                </span>
                {ent?.unlimited && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/20">
                    {isZh ? "无限制" : "Unlimited"}
                  </span>
                )}
              </button>
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

                      // ✅ 未登录禁止 detector/note
                      if (!effectiveSessionExists && (next === "detector" || next === "note")) {
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
                    {mode === "single" ? (isZh ? "单模型选择" : "Model") : mode === "team" ? (isZh ? "团队质量" : "Team quality") : mode === "detector" ? (isZh ? "检测语言" : "Language") : isZh ? "笔记输入" : "Input"}
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

              {/* Language */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
                <span className="text-slate-300 mr-1">🌐</span>
                <button
                  onClick={() => setLang("zh")}
                  className={`px-2 py-0.5 rounded-full transition ${isZh ? "bg-slate-100 text-slate-900 text-[11px] font-medium" : "text-slate-300 hover:text-white"}`}
                >
                  中
                </button>
                <button
                  onClick={() => setLang("en")}
                  className={`px-2 py-0.5 rounded-full transition ${!isZh ? "bg-slate-100 text-slate-900 text-[11px] font-medium" : "text-slate-300 hover:text-white"}`}
                >
                  EN
                </button>
              </div>

              {/* Auth */}
              <div className="flex items-center gap-2">
                {status === "loading" ? (
                  <div className="h-8 w-8 rounded-full bg-slate-800 animate-pulse" />
                ) : effectiveSession ? (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-xs font-semibold text-white shadow-md shadow-blue-500/40">
                      {String(userInitial).toUpperCase()}
                    </div>
                    <div className="hidden sm:flex flex-col text-[11px] leading-tight">
                      <span className="text-slate-100 truncate max-w-[120px]">{effectiveSession.user?.name || effectiveSession.user?.email}</span>
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
            <DetectorUI
              isLoadingGlobal={isLoading}
              isZh={isZh}
              locked={detectorLocked}
              canSeeSuspicious={!!ent?.canSeeSuspiciousSentences}
            />
          ) : mode === "note" ? (
            <NoteUI isLoadingGlobal={isLoading} isZh={isZh} locked={noteLocked} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3 custom-scrollbar">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap max-w-[80%] border backdrop-blur-sm ${
                        msg.role === "user" ? "bg-blue-600 text-white border-blue-400/70 shadow-md shadow-blue-500/30" : "bg-slate-900/80 text-slate-100 border-white/10"
                      }`}
                    >
                      {msg.content}
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

                {/* Basic quota hint (small) */}
                {effectiveSessionExists && ent && !ent.unlimited && ent.plan === "basic" && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {isZh ? "Basic 今日聊天额度：" : "Basic chat quota today: "}
                    <span className="text-slate-300">{ent.usedChatCountToday}/{ent.chatPerDay}</span>
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
        effectiveSessionExists={effectiveSessionExists}
        ent={ent}
        onOpenRedeem={() => {
          if (!effectiveSessionExists) return signIn();
          setRedeemError(null);
          setRedeemOpen(true);
        }}
        onManageBilling={manageBilling}
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
    </main>
  );
}