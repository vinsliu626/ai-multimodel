"use client";

import React, { useMemo, useState } from "react";
import {
  buildCoverageHighlightsFromSentences,
  clampPct,
  countWords,
  hasNonEnglish,
  type DetectorHighlight,
  type DetectorResult,
  type DetectorSentence,
} from "./detector-utils";
import { HighlightEditor } from "./HighlightEditor";

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

export function DetectorUI({
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

      // ✅ 超额：让外层弹套餐（你也可以在这里直接 alert）
      if (res.status === 429) {
        throw new Error(isZh ? "本周检测额度不足，请升级套餐。" : "Weekly detector quota exceeded. Please upgrade.");
      }

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
                  <HighlightEditor value={text} onChange={setText} highlights={result ? highlights : []} placeholder="To analyze text, add at least 40 words." disabled={loading || isLoadingGlobal} />
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
                                    {isZh ? "AI 概率" : "AI"}: <span className="font-semibold text-amber-200">{Math.round(s.aiScore)}%</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500">{Array.isArray(s.reasons) ? s.reasons.join(" · ") : ""}</span>
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

                <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-500">{isZh ? "提示：此功能仅检测英文文本。" : "Tip: This detector is English-only."}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
      </div>
    </div>
  );
}