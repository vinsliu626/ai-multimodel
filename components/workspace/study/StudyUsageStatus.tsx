"use client";

import type { StudyEntitlement } from "./study-types";

function formatMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function StudyUsageStatus({
  entitlement,
  remainingToday,
  modeLimit,
}: {
  entitlement: StudyEntitlement;
  remainingToday: number;
  modeLimit: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Plan</p>
        <p className="mt-2 text-lg font-semibold text-slate-50">{entitlement.plan.toUpperCase()}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Today</p>
        <p className="mt-2 text-lg font-semibold text-slate-50">
          {remainingToday} / {entitlement.studyGenerationsPerDay}
        </p>
        <p className="mt-1 text-xs text-slate-400">remaining generations</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Payload</p>
        <p className="mt-2 text-lg font-semibold text-slate-50">{entitlement.studyMaxExtractedChars.toLocaleString()}</p>
        <p className="mt-1 text-xs text-slate-400">max chars to AI</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Upload</p>
        <p className="mt-2 text-lg font-semibold text-slate-50">{formatMb(entitlement.studyMaxFileSizeBytes)}</p>
        <p className="mt-1 text-xs text-slate-400">
          up to {entitlement.studyMaxQuizQuestions} quiz items, {modeLimit} mode{modeLimit > 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
