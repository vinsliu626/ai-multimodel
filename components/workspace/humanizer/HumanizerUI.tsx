"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { useHumanizerController } from "./useHumanizerController";

type HumanizerEntitlement = {
  plan: "basic" | "pro" | "ultra" | "gift";
  usedHumanizerWordsThisWeek?: number;
  humanizerWordsPerWeek?: number;
  humanizerMaxInputWords?: number;
  humanizerMinInputWords?: number;
};

export function HumanizerUI({
  locked,
  entitlement,
  onUsageRefresh,
}: {
  locked: boolean;
  entitlement: HumanizerEntitlement | null;
  onUsageRefresh?: () => Promise<void> | void;
}) {
  const ctl = useHumanizerController({ locked, entitlement, onUsageRefresh });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const helperText = useMemo(() => {
    if (locked) return "Sign in to use AI Humanizer.";
    if (ctl.inputWords > 0 && ctl.inputWords < ctl.minWords) return `Enter at least ${ctl.minWords} words to continue.`;
    if (ctl.maxWords > 0 && ctl.inputWords > ctl.maxWords) return `Your plan allows up to ${ctl.maxWords} words per request.`;
    if (ctl.remainingWeeklyWords <= 0) return "You've reached your weekly Humanizer limit.";
    return "Lightly revise text to sound more natural and less stiff while keeping your original meaning and phrasing.";
  }, [ctl.inputWords, ctl.maxWords, ctl.minWords, ctl.remainingWeeklyWords, locked]);

  const statusText = ctl.error || ctl.success;

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">AI Humanizer</h2>
          <p className="mt-2 text-sm text-slate-300">Lightly revise text to sound more natural and less stiff while keeping your original meaning and phrasing.</p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-[12px] text-slate-300">{helperText}</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
          <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1fr_0.92fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Input</p>
                  <p className="mt-2 text-sm text-slate-300">Paste the original text for a single consistent light edit style.</p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">{ctl.inputWords} words</div>
              </div>

              <textarea
                value={ctl.text}
                onChange={(event) => ctl.setText(event.target.value)}
                placeholder="Paste text with at least 20 words..."
                className="mt-4 min-h-[360px] w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
                disabled={ctl.loading || locked}
              />

              <div className="mt-4">
                <button
                  onClick={() => void ctl.humanize()}
                  disabled={!ctl.canSubmit}
                  className="h-11 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                >
                  {ctl.loading ? "Humanizing..." : "Humanize"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Output</p>
                  <p className="mt-2 text-sm text-slate-300">Simpler wording, smoother flow, and minimal rewriting.</p>
                </div>
                <CopyButton text={ctl.output} onCopied={() => setCopied(true)} />
              </div>

              {statusText ? (
                <div
                  className={`mt-4 rounded-2xl border px-3 py-2 text-[12px] ${
                    ctl.error
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : ctl.loading
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-200"
                      : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  }`}
                >
                  {statusText}
                </div>
              ) : null}

              <div
                className={`mt-4 min-h-[360px] rounded-3xl border bg-slate-950/60 px-4 py-4 text-sm leading-6 text-slate-100 whitespace-pre-wrap transition ${
                  copied ? "border-emerald-400/40 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]" : "border-white/10"
                }`}
              >
                {ctl.output || <span className="text-slate-500">Humanized text will appear here.</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
      </div>
    </div>
  );
}
