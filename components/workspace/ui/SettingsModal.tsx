"use client";

import React from "react";

export function SettingsModal({
  open,
  onClose,
  isZh,
  theme,
  setTheme,
  lang,
  setLang,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  lang: "zh" | "en";
  setLang: (l: "zh" | "en") => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[94vw] max-w-[520px] rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-50">{isZh ? "设置" : "Settings"}</div>
            <div className="mt-1 text-[11px] text-slate-400">{isZh ? "语言与主题偏好会自动保存" : "Language and theme are persisted"}</div>
          </div>
          <button
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[12px] font-semibold text-slate-50">{isZh ? "语言" : "Language"}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setLang("en")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  lang === "en" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                English
              </button>
              <button
                onClick={() => setLang("zh")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  lang === "zh" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                中文
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[12px] font-semibold text-slate-50">{isZh ? "主题" : "Theme"}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setTheme("dark")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  theme === "dark" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {isZh ? "深色" : "Dark"}
              </button>
              <button
                onClick={() => setTheme("light")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  theme === "light" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {isZh ? "浅色" : "Light"}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {isZh ? "提示：你 WorkspaceShell 里已经做了 localStorage 持久化，这里只是控制入口。" : "Tip: WorkspaceShell persists settings via localStorage; this modal just controls them."}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex justify-end">
          <button
            className="h-10 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] text-slate-100 transition"
            onClick={onClose}
          >
            {isZh ? "完成" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}