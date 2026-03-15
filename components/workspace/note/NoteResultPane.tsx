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
}: {
  isZh: boolean;
  result: string;
  loading?: boolean;
  error?: string | null;
  success?: string | null;
}) {
  const statusText = loading
    ? isZh
      ? "正在生成笔记..."
      : "Generating notes..."
    : error
    ? error
    : success
    ? success
    : null;

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-50">{isZh ? "生成的笔记" : "Generated notes"}</p>
        <div className="flex items-center gap-3">
          {statusText ? (
            <span className={`text-[11px] ${error ? "text-red-300" : loading ? "text-blue-300" : "text-emerald-300"}`}>{statusText}</span>
          ) : null}
          <CopyButton text={result} />
        </div>
      </div>

      <div className="mt-3 min-h-[120px] text-[13px] leading-6 text-slate-100">
        {result ? <AiFormattedText text={result} /> : <span className="text-slate-500">{isZh ? "结构化笔记会显示在这里。" : "Your structured notes will appear here."}</span>}
      </div>
    </div>
  );
}
