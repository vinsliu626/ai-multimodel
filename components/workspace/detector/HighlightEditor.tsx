"use client";
import React from "react";
import type { DetectorHighlight } from "./detector-utils";

function normalizeHighlights(text: string, highlights: DetectorHighlight[]) {
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
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      last.severity = Math.max(last.severity ?? 0, h.severity ?? 0);
    } else {
      merged.push({ ...h });
    }
  }
  return merged;
}

function renderHighlightedText(text: string, highlights: DetectorHighlight[]) {
  if (!text) return null;

  const normalized = normalizeHighlights(text, highlights);
  if (normalized.length === 0) {
    return <span>{text}</span>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  normalized.forEach((highlight, index) => {
    if (cursor < highlight.start) {
      nodes.push(<span key={`text-${index}`}>{text.slice(cursor, highlight.start)}</span>);
    }

    nodes.push(
      <mark
        key={`mark-${index}`}
        className="rounded px-0.5 py-[1px] bg-amber-300/85 text-slate-950 selection:bg-blue-500/35 selection:text-white"
        title={highlight.label || "AI-like"}
      >
        {text.slice(highlight.start, highlight.end)}
      </mark>
    );

    cursor = highlight.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return nodes;
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
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [isEditing, setIsEditing] = React.useState(true);
  const hasHighlights = value.trim().length > 0 && highlights.length > 0;

  React.useEffect(() => {
    setIsEditing(!hasHighlights);
  }, [hasHighlights]);

  React.useEffect(() => {
    if (!isEditing) return;
    textareaRef.current?.focus();
  }, [isEditing]);

  const sharedTextStyle =
    "h-full w-full px-4 py-3 text-[14px] leading-6 font-sans whitespace-pre-wrap break-words";

  return (
    <div className="relative h-full w-full rounded-2xl border border-white/10 bg-slate-950/30 overflow-hidden">
      {hasHighlights && !isEditing ? (
        <div
          role="textbox"
          aria-readonly="true"
          tabIndex={0}
          title="Double-click to edit"
          onDoubleClick={() => setIsEditing(true)}
          className={[
            sharedTextStyle,
            "overflow-auto purple-scrollbar scroll-stable",
            "text-slate-100 selection:bg-blue-500/35 selection:text-white",
            "cursor-text",
          ].join(" ")}
        >
          {renderHighlightedText(value, highlights)}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            "h-full w-full resize-none overflow-auto purple-scrollbar scroll-stable",
            sharedTextStyle,
            "bg-transparent text-slate-100 caret-white",
            "placeholder:text-slate-500",
            "selection:bg-blue-500/35",
            "focus:outline-none",
          ].join(" ")}
          spellCheck={false}
        />
      )}
    </div>
  );
}
