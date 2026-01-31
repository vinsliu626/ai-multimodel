"use client";
import React from "react";
import type { DetectorHighlight } from "./detector-utils";

function renderHighlightLayer(text: string, highlights: DetectorHighlight[]) {
  if (!text) return null;
  const ghost = (s: string) => s.replace(/\n/g, "\n\u200b");

  if (!highlights || highlights.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{ghost(text)}</span>;
  }

  const sorted = [...highlights]
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start)
    .map((h) => ({
      ...h,
      start: Math.max(0, Math.min(text.length, h.start)),
      end: Math.max(0, Math.min(text.length, h.end)),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: DetectorHighlight[] = [];
  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && h.start <= (last.end ?? 0)) last.end = Math.max(last.end ?? 0, h.end);
    else merged.push({ ...h });
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  merged.forEach((h, idx) => {
    const s = h.start!;
    const e = h.end!;
    if (cursor < s) nodes.push(<span key={`t-${idx}-a`}>{ghost(text.slice(cursor, s))}</span>);
    nodes.push(
      <mark
        key={`t-${idx}-m`}
        className="rounded px-0.5 py-[1px] bg-amber-300/85 text-slate-950"
        title={h.label || "AI-like"}
      >
        {ghost(text.slice(s, e))}
      </mark>
    );
    cursor = e;
  });

  if (cursor < text.length) nodes.push(<span key="tail">{ghost(text.slice(cursor))}</span>);
  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}

export function HighlightEditor({
  value,
  onChange,
  highlights,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  highlights: DetectorHighlight[];
  placeholder: string;
  disabled?: boolean;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);

  function syncScroll() {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer) return;
    layer.scrollTop = ta.scrollTop;
    layer.scrollLeft = ta.scrollLeft;
  }

  React.useLayoutEffect(() => {
    syncScroll();
  }, [value, highlights]);

  const sharedTextStyle = "px-4 py-3 text-[14px] leading-6 whitespace-pre-wrap break-words font-sans";

  return (
    <div className="relative h-full w-full rounded-2xl border border-white/10 bg-slate-950/30 overflow-hidden">
      <div
        ref={layerRef}
        className={["absolute inset-0", "overflow-auto scrollbar-none", sharedTextStyle, "text-slate-100", "pointer-events-none"].join(" ")}
      >
        {value ? renderHighlightLayer(value, highlights) : <span className="text-slate-500">{placeholder}</span>}
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          "absolute inset-0 w-full h-full resize-none",
          "overflow-auto purple-scrollbar scroll-stable",
          sharedTextStyle,
          "bg-transparent text-transparent caret-white",
          "placeholder:text-slate-500",
          "selection:bg-blue-500/35",
          "focus:outline-none",
        ].join(" ")}
        spellCheck={false}
      />
    </div>
  );
}