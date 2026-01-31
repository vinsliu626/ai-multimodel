// components/note/NoteUploadPane.tsx
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
    <div className="space-y-3">
      <p className="text-[12px] text-slate-300">
        {isZh
          ? "支持：mp3 / wav / m4a / mp4 / webm / ogg / aac / flac"
          : "Supported: mp3 / wav / m4a / mp4 / webm / ogg / aac / flac"}
      </p>
      <input
        type="file"
        accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.aac,.flac"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold file:bg-white/10 file:text-slate-100 hover:file:bg-white/15"
        disabled={loading || isLoadingGlobal}
      />
      {file && (
        <div className="text-[12px] text-slate-200">
          {isZh ? "已选择：" : "Selected:"} <span className="font-semibold">{file.name}</span>
        </div>
      )}
    </div>
  );
}