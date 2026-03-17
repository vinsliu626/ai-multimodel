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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Recorder</p>
          <p className="mt-2 text-lg font-semibold text-slate-50">{recordSecs}s</p>
        </div>

        {!recording ? (
          <button
            onClick={onStart}
            disabled={loading || isLoadingGlobal || locked}
            className="h-10 rounded-full border border-white/10 bg-white/8 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/12 disabled:opacity-60"
          >
            {isZh ? "Start Recording" : "Start Recording"}
          </button>
        ) : (
          <button onClick={onStop} className="h-10 rounded-full bg-red-500/80 px-5 text-sm font-semibold text-white transition hover:bg-red-500">
            {isZh ? "Stop Recording" : "Stop Recording"}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Chunks</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{uploadedChunks}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Session</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-100">{noteId ? noteId.slice(0, 12) : "Not started"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Finalize</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {loading ? `${finalizeStage} ${Math.round(finalizeProgress)}%` : recording ? "Recording" : "Ready"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-[12px] text-slate-300">
        {recording
          ? "Audio is being captured and chunked in the background."
          : noteId
          ? "Recording stopped. You can generate notes from the uploaded chunks."
          : "Start recording to create a chunked note session."}
      </div>

      {liveTranscript.trim() ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4">
          <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">Live Transcript</div>
          <div className="custom-scrollbar max-h-[220px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-100">{liveTranscript}</div>
        </div>
      ) : null}
    </div>
  );
}
