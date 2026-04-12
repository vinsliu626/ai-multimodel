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

  const copy = isZh
    ? {
        title: "设置",
        subtitle: "语言与主题会自动保存在当前浏览器中。",
        language: "语言",
        theme: "主题",
        privacy: "隐私",
        privacyDesc: "查看隐私政策，并了解本地偏好只保存在这台设备上。",
        english: "English",
        chinese: "中文",
        dark: "深色",
        light: "浅色",
        privacyPolicy: "隐私政策",
        done: "完成",
      }
    : {
        title: "Settings",
        subtitle: "Language and theme are saved automatically in this browser.",
        language: "Language",
        theme: "Theme",
        privacy: "Privacy",
        privacyDesc: "Review the privacy policy and note that local preferences stay on this device only.",
        english: "English",
        chinese: "Chinese",
        dark: "Dark",
        light: "Light",
        privacyPolicy: "Privacy Policy",
        done: "Done",
      };

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[94vw] max-w-[520px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-50">{copy.title}</div>
            <div className="mt-1 text-[11px] text-slate-400">{copy.subtitle}</div>
          </div>
          <button
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            onClick={onClose}
            aria-label={copy.done}
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[12px] font-semibold text-slate-50">{copy.language}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setLang("en")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  lang === "en" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {copy.english}
              </button>
              <button
                onClick={() => setLang("zh")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  lang === "zh" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {copy.chinese}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[12px] font-semibold text-slate-50">{copy.theme}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setTheme("dark")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  theme === "dark" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {copy.dark}
              </button>
              <button
                onClick={() => setTheme("light")}
                className={[
                  "flex-1 h-10 rounded-2xl border border-white/10 transition text-[12px]",
                  theme === "light" ? "bg-white/10 text-slate-50" : "bg-transparent hover:bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {copy.light}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[12px] font-semibold text-slate-50">{copy.privacy}</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">{copy.privacyDesc}</p>
            <a
              href="/privacy"
              className="mt-3 inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] text-slate-100 transition hover:bg-white/10"
            >
              {copy.privacyPolicy}
            </a>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-4">
          <button
            className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] text-slate-100 transition hover:bg-white/10"
            onClick={onClose}
          >
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
}
