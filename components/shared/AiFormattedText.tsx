"use client";

import React from "react";
import { detectAiMarker, normalizeAiText } from "@/lib/ui/aiTextFormat";

function lineClass(kind: ReturnType<typeof detectAiMarker>["kind"]) {
  switch (kind) {
    case "important":
      return "rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 font-semibold text-amber-50";
    case "concept":
      return "rounded-2xl border border-sky-300/15 bg-sky-300/10 px-3 py-2 text-sky-50";
    case "tip":
      return "rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-3 py-2 font-medium text-cyan-50";
    case "example":
      return "rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-3 py-2 text-emerald-50";
    case "warning":
      return "rounded-2xl border border-red-300/20 bg-red-300/10 px-3 py-2 font-medium text-red-50";
    default:
      return "text-slate-100";
  }
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
        const marker = detectAiMarker(line);
        if (!marker.text) {
          return <div key={`blank-${index}`} className="h-2" />;
        }

        return (
          <div key={`${index}-${marker.text.slice(0, 18)}`} className={lineClass(marker.kind)}>
            {marker.text}
          </div>
        );
      })}
    </div>
  );
}
