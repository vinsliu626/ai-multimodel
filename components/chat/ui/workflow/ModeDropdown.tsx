"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMode, Lang } from "./types";

function labelFor(mode: ChatMode, lang: Lang) {
  const isZh = lang === "zh";
  switch (mode) {
    case "workflow":
      return isZh ? "Chat / Workflow" : "Chat / Workflow";
    case "normal":
      return isZh ? "Chat / Normal" : "Chat / Normal";
    case "detector":
      return isZh ? "AI Detector" : "AI Detector";
    case "note":
      return isZh ? "AI Note" : "AI Note";
    case "study":
      return isZh ? "AI Study" : "AI Study";
    case "humanizer":
      return isZh ? "AI Humanizer" : "AI Humanizer";
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

  const items: { value: ChatMode; title: string; desc: string }[] = useMemo(
    () => [
      {
        value: "normal",
        title: isZh ? "Chat / Normal" : "Chat / Normal",
        desc: isZh ? "Fast, classic chat" : "Fast, classic chat",
      },
      {
        value: "workflow",
        title: isZh ? "Chat / Workflow" : "Chat / Workflow",
        desc: isZh ? "Planner, Writer, Reviewer + Conclusion" : "Planner, Writer, Reviewer + Conclusion",
      },
      {
        value: "detector",
        title: isZh ? "AI Detector" : "AI Detector",
        desc: isZh ? "Detect AI-like writing patterns" : "Detect AI-like writing patterns",
      },
      {
        value: "note",
        title: isZh ? "AI Note" : "AI Note",
        desc: isZh ? "Generate notes from audio or text" : "Generate notes from audio or text",
      },
      {
        value: "study",
        title: isZh ? "AI Study" : "AI Study",
        desc: isZh ? "Upload documents for notes, flashcards, and quizzes" : "Upload documents for notes, flashcards, and quizzes",
      },
      {
        value: "humanizer",
        title: isZh ? "AI Humanizer" : "AI Humanizer",
        desc: isZh ? "Rewrite for better flow and readability" : "Rewrite for better flow and readability",
      },
    ],
    [isZh]
  );

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
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
        title={isZh ? "Switch mode" : "Switch mode"}
      >
        <span className="text-slate-200">{labelFor(value, lang)}</span>
        <span className="text-slate-400">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[280px] rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-white/5">
            {isZh ? "Choose a workspace" : "Choose a workspace"}
          </div>

          <div className="p-1">
            {items.map((item) => {
              const active = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  className={["w-full text-left px-3 py-2 rounded-xl transition", active ? "bg-white/10" : "hover:bg-white/10"].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-100 font-medium">{item.title}</div>
                    {active ? <div className="text-emerald-300 text-xs">✓</div> : null}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
