"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMode, Lang } from "./types";

function labelFor(mode: ChatMode, lang: Lang) {
  const isZh = lang === "zh";
  switch (mode) {
    case "workflow":
      return isZh ? "聊天 · 工作流" : "Chat · Workflow";
    case "normal":
      return isZh ? "聊天 · 普通" : "Chat · Normal";
    case "detector":
      return isZh ? "AI 检测" : "AI Detector";
    case "note":
      return isZh ? "AI 笔记" : "AI Note";
    default:
      return mode;
  }
}

export function ModeDropdown({
  value,
  onChange,
  lang,
  disabled,
}: {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  lang: Lang;
  disabled?: boolean;
}) {
  const isZh = lang === "zh";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

    const items: { value: ChatMode; title: string; desc: string }[] = useMemo(() => {
    return [
        {
        value: "normal",
        title: isZh ? "聊天 · 普通" : "Chat · Normal",
        desc: isZh ? "快速，传统对话" : "Fast, classic chat",
        },
        {
        value: "workflow",
        title: isZh ? "聊天 · 工作流" : "Chat · Workflow",
        desc: isZh ? "Planner/Writer/Reviewer/Final 展示" : "Planner/Writer/Reviewer/Final view",
        },
        {
        value: "detector",
        title: isZh ? "AI 检测" : "AI Detector",
        desc: isZh ? "检测文本可能的 AI 痕迹" : "Detect AI-likeness",
        },
        {
        value: "note",
        title: isZh ? "AI 笔记" : "AI Note",
        desc: isZh ? "音频/文本生成笔记" : "Notes from audio/text",
        },
    ];
    }, [isZh]);


  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          "h-9 px-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition",
          "text-xs text-slate-100 flex items-center gap-2",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
        title={isZh ? "切换模式" : "Switch mode"}
      >
        <span className="text-slate-200">{labelFor(value, lang)}</span>
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[260px] rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-white/5">
            {isZh ? "选择一个工作区" : "Choose a workspace"}
          </div>

          <div className="p-1">
            {items.map((it) => {
              const active = it.value === value;
              return (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => {
                    onChange(it.value);
                    setOpen(false);
                  }}
                  className={[
                    "w-full text-left px-3 py-2 rounded-xl transition",
                    active ? "bg-white/10" : "hover:bg-white/10",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-100 font-medium">{it.title}</div>
                    {active ? <div className="text-emerald-300 text-xs">✓</div> : null}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{it.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
