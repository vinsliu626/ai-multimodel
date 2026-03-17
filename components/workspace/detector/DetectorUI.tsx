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
import { DetectorProgressRing } from "./DetectorProgressRing";
import { DetectorResultSummary } from "./DetectorResultSummary";
import { DetectorScoreCard } from "./DetectorScoreCard";

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

const RESULT_SUMMARY = {
  title: "This text appears highly natural and human-like.",
  description: "Sentence variation and phrasing suggest low AI detectability.",
};

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

  function handleTextChange(nextText: string) {
    setText(nextText);
    if (nextText === text) return;
    if (result) setResult(null);
    if (error) setError(null);
    if (highlights.length > 0) setHighlights([]);
    if (sentences.length > 0) setSentences([]);
  }

  const englishWarning = useMemo(() => {
    if (!text.trim()) return null;
    if (hasNonEnglish(text)) return isZh ? "Only English text is supported." : "Only English text is supported.";
    return null;
  }, [text, isZh]);

  const tooShort = useMemo(() => {
    if (!text.trim()) return false;
    return words < 80;
  }, [text, words]);

  async function detect() {
    if (locked) {
      setError(isZh ? "Please sign in to use AI Detector." : "Please sign in to use AI Detector.");
      return;
    }
    if (loading || isLoadingGlobal) return;

    setError(null);
    setResult(null);
    setHighlights([]);
    setSentences([]);

    const t = text.trim();
    if (!t) {
      setError(isZh ? "Please paste text to begin analysis." : "Please paste text to begin analysis.");
      return;
    }
    if (countWords(t) < 80) {
      setError(isZh ? "To analyze text, add at least 80 words." : "To analyze text, add at least 80 words.");
      return;
    }
    if (hasNonEnglish(t)) {
      setError(isZh ? "Only English text is supported." : "Only English text is supported.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai-detector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, lang: "en" }),
      });

      if (res.status === 429) {
        throw new Error(isZh ? "Weekly detector quota exceeded. Please upgrade." : "Weekly detector quota exceeded. Please upgrade.");
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || data?.error || `Detector API error: ${res.status}`);
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
      setError(e?.message || (isZh ? "Failed to analyze." : "Failed to analyze."));
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
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 shadow-md shadow-blue-500/30" />
            <div className="leading-tight">
              <p className="text-xs uppercase tracking-widest text-slate-400">AI Detector</p>
              <p className="text-sm font-semibold text-slate-50">
                {isZh ? "Inline highlight / Results" : "Inline highlight / Results"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-[11px] text-slate-400 sm:flex">
            {words > 0 ? `${words} words` : "Paste text to begin"}
          </div>
        </div>

        {locked && (
          <div className="px-4 pt-3">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              Sign in to use AI Detector (Basic has weekly quota).
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex-1 overflow-hidden p-4">
            <div className="h-full rounded-3xl bg-gradient-to-r from-blue-500/60 via-purple-500/50 to-cyan-400/50 p-[1px]">
              <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-50">Text</p>
                    <p className="text-[11px] text-slate-400">{tooShort ? "Add at least 80 words" : " "}</p>
                  </div>

                  <button
                    onClick={detect}
                    disabled={!canDetect}
                    className="h-10 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none"
                  >
                    {loading ? "Analyzing…" : "Detect AI"}
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
                    onChange={handleTextChange}
                    highlights={result ? highlights : []}
                    placeholder="To analyze text, add at least 80 words."
                    disabled={loading || isLoadingGlobal}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-[11px] text-slate-400">
                  <span>{words > 0 ? `${words} words` : " "}</span>
                  <span className="text-slate-500">Highlight coverage follows overall AI%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full overflow-hidden p-4 lg:w-[420px]">
            <div className="h-full rounded-3xl bg-gradient-to-b from-white/10 via-blue-500/20 to-purple-500/20 p-[1px]">
              <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 shadow-xl backdrop-blur-xl">
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-50">Results</p>
                  <p className="mt-1 text-[11px] text-slate-400">Breakdown and suspicious sentences</p>
                </div>

                <div className="custom-scrollbar mt-1 flex-1 overflow-y-auto px-4 py-4">
                  {!result && !error && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] text-slate-300">
                      Paste English text (80+ words) and click Detect AI.
                    </div>
                  )}

                  {result && (
                    <div className="flex h-full flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <DetectorScoreCard
                          label="AI Rate"
                          value={result.aiGenerated}
                          accentClass="bg-amber-400 text-amber-400"
                          trackClass="bg-gradient-to-r from-amber-400 via-orange-300 to-amber-200"
                        />
                        <DetectorScoreCard
                          label="Human Score"
                          value={result.humanWritten}
                          accentClass="bg-emerald-300 text-emerald-300"
                          trackClass="bg-gradient-to-r from-cyan-400 via-emerald-300 to-emerald-200"
                        />
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_132px] items-stretch gap-3">
                        <DetectorResultSummary
                          title={RESULT_SUMMARY.title}
                          description={RESULT_SUMMARY.description}
                        />
                        <div className="flex items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                          <DetectorProgressRing value={result.aiGenerated} label="AI Rate" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <ResultRow label="AI-generated" value={result.aiGenerated} dot="bg-amber-400" />
                        <ResultRow label="Human-written & AI-refined" value={result.humanAiRefined} dot="bg-sky-300" />
                        <ResultRow label="Human-written" value={result.humanWritten} dot="bg-slate-200" />
                      </div>

                      {!canSeeSuspicious ? (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
                          Suspicious sentence list is available for Pro/Ultra or Gift users.
                        </div>
                      ) : (
                        <details className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                          <summary className="cursor-pointer select-none text-[12px] text-slate-200">
                            {`Suspicious sentences (${suspiciousSentences.length})`}
                          </summary>

                          <div className="mt-3 space-y-2">
                            {suspiciousSentences.map((sentence, index) => (
                              <div key={index} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-300">
                                    AI: <span className="font-semibold text-amber-200">{Math.round(sentence.aiScore)}%</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {Array.isArray(sentence.reasons) ? sentence.reasons.join(" · ") : ""}
                                  </span>
                                </div>
                                <div className="mt-1 text-[12px] leading-5 text-slate-100">{sentence.text}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      <div className="pt-1 text-[11px] text-slate-500">{`Highlight spans: ${highlights.length}`}</div>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-500">
                  Tip: This detector is English-only.
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
