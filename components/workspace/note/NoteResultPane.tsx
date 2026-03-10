"use client";

import React from "react";

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
      </div>

      <div className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-slate-100 min-h-[120px]">
        {result ? <>{result}</> : <span className="text-slate-500">{isZh ? "生成后会在这里显示结构化笔记。" : "Your structured notes will appear here."}</span>}
      </div>
    </div>
  );
}
