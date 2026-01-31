// components/note/NoteTabs.tsx
"use client";

import React from "react";
import type { NoteTab } from "./useNoteController";

export function NoteTabs({
  tab,
  isZh,
  recording,
  loading,
  isLoadingGlobal,
  locked,
  onSwitch,
}: {
  tab: NoteTab;
  isZh: boolean;
  recording: boolean;
  loading: boolean;
  isLoadingGlobal: boolean;
  locked: boolean;
  onSwitch: (t: NoteTab) => void;
}) {
  const tabBtn = (k: NoteTab, label: string) => {
    const active = tab === k;
    return (
      <button
        type="button"
        onClick={() => onSwitch(k)}
        className={[
          "h-10 px-5 rounded-full text-sm font-semibold transition",
          active
            ? "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30"
            : "bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  // ❗️不加 wrapper，直接返回原来那段按钮组
  return (
    <div className="flex items-center gap-2">
      {tabBtn("upload", isZh ? "上传" : "Upload")}
      {tabBtn("record", isZh ? "录音" : "Record")}
      {tabBtn("text", isZh ? "文本" : "Text")}
    </div>
  );
}