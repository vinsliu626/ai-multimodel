"use client";

import React from "react";

export function NoteUploadPane({
  isZh,
  loading,
  isLoadingGlobal,
  file,
  onPickFile,
}: {
  isZh: boolean;
  loading: boolean;
  isLoadingGlobal: boolean;
  file: File | null;
  onPickFile: (f: File | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-sm font-semibold text-slate-100">{file ? file.name : "Drop in an audio file or browse from disk"}</p>
        <p className="mt-2 text-[12px] text-slate-400">mp3 / wav / m4a / mp4 / webm / ogg / aac / flac</p>
        <label className="mt-5 inline-flex cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10">
          <input
            type="file"
            accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.aac,.flac"
            onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
            className="hidden"
            disabled={loading || isLoadingGlobal}
          />
          {isZh ? "Choose Audio" : "Choose Audio"}
        </label>
      </div>

      {file ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-[12px] text-slate-300">
          Selected file: <span className="font-semibold text-slate-100">{file.name}</span>
        </div>
      ) : null}
    </div>
  );
}
