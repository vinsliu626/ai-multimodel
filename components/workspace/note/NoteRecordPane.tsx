// components/note/NoteRecordPane.tsx
"use client";

import React from "react";

export function NoteRecordPane({
  isZh,
  locked,
  loading,
  isLoadingGlobal,
  recording,
  recordSecs,
  noteId,
  uploadedChunks,
  liveTranscript,
  finalizeStage,
  finalizeProgress,
  onStart,
  onStop,
}: {
  isZh: boolean;
  locked: boolean;
  loading: boolean;
  isLoadingGlobal: boolean;

  recording: boolean;
  recordSecs: number;
  noteId: string | null;
  uploadedChunks: number;
  liveTranscript: string;

  finalizeStage: string;
  finalizeProgress: number;

  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-slate-300">
          {isZh ? "录音时长：" : "Duration:"}{" "}
          <span className="font-semibold text-slate-100">{recordSecs}s</span>
        </div>

        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              onClick={onStart}
              disabled={loading || isLoadingGlobal || locked}
              className="h-10 px-5 rounded-full bg-white/10 text-slate-100 border border-white/10 hover:bg-white/15 transition font-semibold disabled:opacity-60"
            >
              {isZh ? "开始录音" : "Start"}
            </button>
          ) : (
            <button
              onClick={onStop}
              className="h-10 px-5 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition font-semibold"
            >
              {isZh ? "停止" : "Stop"}
            </button>
          )}
        </div>

        {/* ✅ Finalize progress (record only) */}
        {loading && noteId && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3">
            <div className="flex items-center justify-between text-[12px] text-slate-300">
              <span>
                {isZh ? "处理中：" : "Processing: "}
                <span className="ml-1 font-semibold text-slate-100">{finalizeStage}</span>
              </span>
              <span className="font-semibold text-slate-100">{Math.round(finalizeProgress)}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-white/30" style={{ width: `${Math.round(finalizeProgress)}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-[12px] text-slate-300">
        {recording
          ? isZh
            ? `录音中…：${uploadedChunks}`
            : `Recording… : ${uploadedChunks}`
          : noteId
          ? isZh
            ? `录音已停止。已上传分片：${uploadedChunks}，可以生成笔记。`
            : `Stopped. Uploaded chunks: ${uploadedChunks}. Ready to generate.`
          : isZh
          ? "点击开始录音，系统会每 30 秒自动上传并转写。"
          : "Click Start. It will upload & transcribe every 30s."}
      </div>

      {!!liveTranscript.trim() && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3">
          <div className="text-[12px] text-slate-300 mb-2">
            {isZh ? "实时转写（可选显示）" : "Live transcript (optional)"}
          </div>
          <div className="whitespace-pre-wrap text-[12px] leading-5 text-slate-100 max-h-[200px] overflow-y-auto custom-scrollbar">
            {liveTranscript}
          </div>
        </div>
      )}
    </div>
  );
}