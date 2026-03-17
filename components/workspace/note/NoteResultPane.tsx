"use client";

import React from "react";
import { AiFormattedText } from "@/components/shared/AiFormattedText";
import { CopyButton } from "@/components/ui/copy-button";

export function NoteResultPane({
  isZh,
  result,
  loading,
  error,
  success,
  progressStage,
  progressPercent,
}: {
  isZh: boolean;
  result: string;
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  progressStage?: string;
  progressPercent?: number;
}) {
  const statusText = loading
    ? `Generating... ${Math.round(progressPercent ?? 0)}%`
    : error
    ? error
    : success
    ? success
    : null;

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Generated Notes</p>
          <p className="mt-2 text-lg font-semibold text-slate-50">{result ? (isZh ? "Final note output" : "Final note output") : "Awaiting result"}</p>
          <p className="mt-1 text-sm text-slate-400">{progressStage ? `Stage: ${progressStage}` : " "}</p>
        </div>

        <div className="flex items-center gap-3">
          {statusText ? (
            <span className={`text-[11px] ${error ? "text-red-300" : loading ? "text-cyan-300" : "text-emerald-300"}`}>{statusText}</span>
          ) : null}
          <CopyButton text={result} />
        </div>
      </div>

      <div className="mt-5 min-h-[320px] text-[13px] leading-7 text-slate-100 md:min-h-[360px] lg:min-h-[420px]">
        {result ? <AiFormattedText text={result} /> : <span className="text-slate-500">{isZh ? "结构化笔记会显示在这里。" : "Structured notes will appear here."}</span>}
      </div>
    </div>
  );
}
