"use client";

import React from "react";
import type { WorkflowMessage } from "./types";
import { STAGE_META } from "./meta";

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
  const collapsed = msg.collapsed !== false; // default true

  return (
    <div className={`w-full flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[820px] w-[min(820px,92%)]">
        {/* header */}
        <div className={`mb-1 flex items-center gap-2 ${isRight ? "justify-end" : "justify-start"}`}>
          {!isRight && <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />}
          <div className={`text-xs ${meta.header} flex items-center gap-2`}>
            <span className="font-semibold">{msg.title ?? meta.titleFallback}</span>
            {msg.subtitle ? (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300/80">{msg.subtitle}</span>
              </>
            ) : null}
          </div>
          {isRight && <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />}
        </div>

        {/* bubble */}
        <div
          className={[
            "relative rounded-2xl px-4 py-3",
            meta.bubble,
            "before:absolute before:top-3 before:h-3 before:w-3 before:rotate-45 before:rounded-sm before:border before:border-slate-700/60 before:bg-inherit",
            isRight
              ? "before:right-[-6px] before:border-l-0 before:border-b-0"
              : "before:left-[-6px] before:border-r-0 before:border-t-0",
          ].join(" ")}
        >
          {/* Final title row */}
          {meta.isFinal ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-200">
                  ✓
                </span>
                <span className="font-semibold text-emerald-100">{msg.title ?? (isZh ? "结论" : "Conclusion")}</span>
              </div>

              {/* ✅ toggle button */}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle?.(msg.id)}
                  className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-slate-200"
                >
                  {isZh ? "思考过程" : "Reasoning"} {collapsed ? "▾" : "▴"}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* main content */}
          <div className="whitespace-pre-wrap leading-relaxed text-sm">{msg.content}</div>

          {/* ✅ children expanded */}
          {meta.isFinal && hasChildren && !collapsed ? (
            <div className="mt-4 pt-3 border-t border-white/10 space-y-3">
              {msg.children!.map((c) => {
                const cMeta = STAGE_META[c.stage];
                return (
                  <div key={c.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${cMeta.dot}`} />
                      <div className="text-xs text-slate-200 font-semibold">{c.title ?? cMeta.titleFallback}</div>
                      {c.subtitle ? <div className="text-xs text-slate-400">· {c.subtitle}</div> : null}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-sm text-slate-100">{c.content}</div>
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
