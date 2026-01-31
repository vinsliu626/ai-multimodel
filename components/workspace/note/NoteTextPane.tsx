// components/note/NoteTextPane.tsx
"use client";

import React from "react";

export function NoteTextPane({
  isZh,
  loading,
  isLoadingGlobal,
  locked,
  text,
  onChangeText,
  onResetAll,
}: {
  isZh: boolean;
  loading: boolean;
  isLoadingGlobal: boolean;
  locked: boolean;
  text: string;
  onChangeText: (v: string) => void;
  onResetAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => {
          onResetAll();
          onChangeText(e.target.value);
        }}
        placeholder={isZh ? "粘贴课堂/会议文字稿..." : "Paste transcript/notes here..."}
        className="w-full h-40 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        disabled={loading || isLoadingGlobal || locked}
      />
      <p className="text-[11px] text-slate-400">
        {isZh ? "建议：越完整越好（可包含时间点、说话人、章节标题）。" : "Tip: fuller transcript yields better notes."}
      </p>
    </div>
  );
}