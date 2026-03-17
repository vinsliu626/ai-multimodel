"use client";

import React, { useEffect, useState } from "react";
import type { WorkflowMessage } from "./types";
import { STAGE_META } from "./meta";
import { AiFormattedText } from "@/components/shared/AiFormattedText";
import { CopyButton } from "@/components/ui/copy-button";

export function Bubble({
  msg,
  isZh,
  onToggle,
}: {
  msg: WorkflowMessage;
  isZh: boolean;
  onToggle?: (id: string) => void;
}) {
  const meta = STAGE_META[msg.stage];
  const isRight = meta.side === "right";
  const hasChildren = Array.isArray(msg.children) && msg.children.length > 0;
  const collapsed = msg.collapsed !== false;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className={`flex w-full ${isRight ? "justify-end" : "justify-start"}`}>
      <div className="w-[min(820px,92%)] max-w-[820px]">
        <div className={`mb-1 flex items-center gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
          {!isRight ? <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} /> : null}
          <div className={`flex items-center gap-2 text-xs ${meta.header}`}>
            <span className="font-semibold">{msg.title ?? meta.titleFallback}</span>
            {msg.subtitle ? (
              <>
                <span className="text-slate-500">路</span>
                <span className="text-slate-300/80">{msg.subtitle}</span>
              </>
            ) : null}
          </div>
          {isRight ? <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} /> : null}
        </div>

        <div
          className={[
            "relative rounded-2xl px-4 py-3 transition",
            meta.bubble,
            copied ? "ring-1 ring-emerald-400/30" : "",
            "before:absolute before:top-3 before:h-3 before:w-3 before:rotate-45 before:rounded-sm before:border before:border-slate-700/60 before:bg-inherit",
            isRight ? "before:right-[-6px] before:border-b-0 before:border-l-0" : "before:left-[-6px] before:border-r-0 before:border-t-0",
          ].join(" ")}
        >
          {meta.isFinal ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-200">+</span>
                <span className="font-semibold text-emerald-100">{msg.title ?? (isZh ? "结论" : "Conclusion")}</span>
              </div>
            </div>
          ) : null}

          <AiFormattedText text={msg.content} className="text-sm leading-relaxed" />

          {!isRight ? (
            <div className="mt-3 flex items-center justify-end gap-2 pt-1">
              {meta.isFinal && hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle?.(msg.id)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-white/10"
                >
                  {isZh ? "Reasoning" : "Reasoning"} {collapsed ? "▾" : "▴"}
                </button>
              ) : null}
              <CopyButton text={msg.content} onCopied={() => setCopied(true)} className="bg-slate-950/80 hover:bg-slate-900" />
            </div>
          ) : null}

          {meta.isFinal && hasChildren && !collapsed ? (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
              {msg.children!.map((child) => {
                const childMeta = STAGE_META[child.stage];
                return (
                  <div key={child.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${childMeta.dot}`} />
                      <div className="text-xs font-semibold text-slate-200">{child.title ?? childMeta.titleFallback}</div>
                      {child.subtitle ? <div className="text-xs text-slate-400">路 {child.subtitle}</div> : null}
                    </div>
                    <AiFormattedText text={child.content} className="text-sm leading-relaxed text-slate-100" />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
