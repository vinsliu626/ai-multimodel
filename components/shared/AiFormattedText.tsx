"use client";

import React from "react";
import { detectAiMarker, normalizeAiText } from "@/lib/ui/aiTextFormat";

function markerClass(kind: ReturnType<typeof detectAiMarker>["kind"]) {
  switch (kind) {
    case "important":
      return "border-l-2 border-amber-300/60 pl-3 text-amber-100";
    case "concept":
      return "border-l-2 border-sky-300/60 pl-3 text-sky-100";
    case "tip":
      return "border-l-2 border-cyan-300/60 pl-3 text-cyan-100";
    case "example":
      return "border-l-2 border-emerald-300/60 pl-3 text-emerald-100";
    case "warning":
      return "border-l-2 border-red-300/60 pl-3 text-red-100";
    default:
      return "text-slate-100";
  }
}

function headingClass(level: number) {
  if (level === 1) return "text-2xl font-semibold tracking-tight text-white";
  if (level === 2) return "mt-6 text-lg font-semibold text-slate-50";
  return "mt-4 text-base font-semibold text-slate-100";
}

function listIndent(line: string) {
  const indent = line.match(/^\s*/)?.[0].length ?? 0;
  return Math.min(4, Math.floor(indent / 2));
}

function indentPadding(indent: number) {
  if (indent <= 0) return "";
  if (indent === 1) return "pl-4";
  if (indent === 2) return "pl-8";
  return "pl-10";
}

export function AiFormattedText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const normalized = normalizeAiText(text);
  const lines = normalized ? normalized.split("\n") : [];

  if (!normalized) return null;

  return (
    <div className={["space-y-2", className].join(" ").trim()}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`blank-${index}`} className="h-3" />;
        }

        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          return (
            <div key={`${index}-${trimmed.slice(0, 18)}`} className={headingClass(heading[1].length)}>
              {heading[2]}
            </div>
          );
        }

        const bullet = line.match(/^(\s*)([-*])\s+(.+)$/);
        if (bullet) {
          const indent = listIndent(line);
          return (
            <div key={`${index}-${trimmed.slice(0, 18)}`} className={["flex gap-3", indentPadding(indent)].join(" ").trim()}>
              <span className="mt-[0.45rem] h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
              <div className="min-w-0 flex-1 text-slate-100">{bullet[3]}</div>
            </div>
          );
        }

        const numbered = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (numbered) {
          const indent = listIndent(line);
          return (
            <div key={`${index}-${trimmed.slice(0, 18)}`} className={["flex gap-3", indentPadding(indent)].join(" ").trim()}>
              <span className="min-w-6 flex-none text-right text-slate-400">{numbered[2]}.</span>
              <div className="min-w-0 flex-1 text-slate-100">{numbered[3]}</div>
            </div>
          );
        }

        const marker = detectAiMarker(trimmed);
        return (
          <div key={`${index}-${trimmed.slice(0, 18)}`} className={markerClass(marker.kind)}>
            {marker.text}
          </div>
        );
      })}
    </div>
  );
}
