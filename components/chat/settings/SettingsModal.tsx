"use client";

import React from "react";

export type Lang = "zh" | "en";

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
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-50">{isZh ? "设置" : "Settings"}</p>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-50">{isZh ? "主题" : "Theme"}</div>
                <div className="text-xs text-slate-400 mt-1">{isZh ? "切换黑/白背景" : "Switch between Dark / Light"}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme("dark")}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                    theme === "dark" ? "bg-white/15 border-white/20 text-white" : "bg-white/5 border-white/10 text-slate-300"
                  }`}
                >
                  {isZh ? "黑" : "Dark"}
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                    theme === "light" ? "bg-white/15 border-white/20 text-white" : "bg-white/5 border-white/10 text-slate-300"
                  }`}
                >
                  {isZh ? "白" : "Light"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-50">{isZh ? "语言" : "Language"}</div>
                <div className="text-xs text-slate-400 mt-1">{isZh ? "默认英文，按需切换" : "Default is English"}</div>
              </div>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="h-10 rounded-xl bg-slate-900 border border-white/15 px-3 text-sm text-slate-100"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">{isZh ? "提示：设置会保存在本地浏览器。" : "Tip: Settings are saved in your browser."}</div>
        </div>
      </div>
    </div>
  );
}