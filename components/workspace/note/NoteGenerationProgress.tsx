"use client";

import React from "react";

const STAGES = ["analyzing", "extracting", "summarizing", "formatting"] as const;

function normalizedStage(stage: string) {
  const value = stage.toLowerCase();
  if (value === "idle") return "idle";
  if (value === "prep") return "analyzing";
  if (value === "asr") return "extracting";
  if (value === "llm" || value === "merge") return "summarizing";
  if (value === "done") return "formatting";
  if (value === "failed") return "failed";
  return STAGES.includes(value as (typeof STAGES)[number]) ? value : "analyzing";
}

function stageLabel(stage: string) {
  const value = normalizedStage(stage);
  if (value === "idle") return "Ready";
  if (value === "failed") return "Failed";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stageDescription(stage: string) {
  const value = normalizedStage(stage);
  if (value === "idle") return "Choose an input mode and start a generation.";
  if (value === "analyzing") return "Preparing the request and checking the input.";
  if (value === "extracting") return "Transcribing or extracting the source material.";
  if (value === "summarizing") return "Building the note structure and key points.";
  if (value === "formatting") return "Finalizing the note output.";
  return "Processing stopped unexpectedly.";
}

export function NoteGenerationProgress({
  progress,
  stage,
  resultReady,
  error,
}: {
  isZh: boolean;
  loading: boolean;
  progress: number;
  stage: string;
  resultReady: boolean;
  error?: string | null;
}) {
  const currentStage = normalizedStage(stage);
  const stageIndex = currentStage === "idle" || currentStage === "failed" ? -1 : STAGES.indexOf(currentStage as (typeof STAGES)[number]);
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  const title = error ? "Generation interrupted" : resultReady ? "Notes ready" : stageLabel(stage);
  const description = error ? error : resultReady ? "The generated note is available below." : stageDescription(stage);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Progress</p>
          <p className="mt-2 text-lg font-semibold text-slate-50">{title}</p>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tracking-tight text-slate-50">{percent}%</p>
          <p className="mt-1 text-[11px] text-slate-500">Completion</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-5 space-y-2">
        {STAGES.map((item, index) => {
          const state =
            currentStage === "failed"
              ? "idle"
              : index < stageIndex
              ? "done"
              : index === stageIndex
              ? resultReady
                ? "done"
                : "active"
              : "idle";

          return (
            <div
              key={item}
              className={[
                "flex items-center justify-between rounded-2xl border px-3 py-3",
                state === "done"
                  ? "border-emerald-400/20 bg-emerald-400/10"
                  : state === "active"
                  ? "border-cyan-400/20 bg-cyan-400/10"
                  : "border-white/8 bg-white/[0.03]",
              ].join(" ")}
            >
              <div>
                <p className="text-sm font-medium text-slate-100">{stageLabel(item)}</p>
                <p className="mt-1 text-[11px] text-slate-400">{stageDescription(item)}</p>
              </div>
              <span
                className={[
                  "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]",
                  state === "done"
                    ? "bg-emerald-300/15 text-emerald-200"
                    : state === "active"
                    ? "bg-cyan-300/15 text-cyan-200"
                    : "bg-white/5 text-slate-500",
                ].join(" ")}
              >
                {state === "done" ? "Done" : state === "active" ? "Active" : "Queued"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
