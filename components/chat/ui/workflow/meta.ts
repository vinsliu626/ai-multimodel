import type { Stage } from "./types";

export const STAGE_META: Record<
  Stage,
  {
    side: "left" | "right";
    dot: string;
    bubble: string;
    header: string;
    titleFallback: string;
    isFinal?: boolean;
  }
> = {
  user: {
    side: "right",
    dot: "bg-slate-400",
    bubble: "bg-slate-800/70 border border-slate-700/60 text-slate-100",
    header: "text-slate-200",
    titleFallback: "You",
  },
  planner: {
    side: "left",
    dot: "bg-emerald-400",
    bubble: "bg-slate-900/60 border border-slate-700/60 text-slate-100",
    header: "text-slate-100",
    titleFallback: "Planner",
  },
  writer: {
    side: "left",
    dot: "bg-violet-400",
    bubble: "bg-slate-900/60 border border-slate-700/60 text-slate-100",
    header: "text-slate-100",
    titleFallback: "Writer",
  },
  reviewer: {
    side: "left",
    dot: "bg-sky-400",
    bubble: "bg-slate-900/60 border border-slate-700/60 text-slate-100",
    header: "text-slate-100",
    titleFallback: "Reviewer",
  },
  assistant: {
    side: "left",
    dot: "bg-slate-300",
    bubble: "bg-slate-900/60 border border-slate-700/60 text-slate-100",
    header: "text-slate-100",
    titleFallback: "AI",
  },
  final: {
    side: "left",
    dot: "bg-emerald-400",
    bubble:
      "bg-gradient-to-r from-emerald-500/10 via-slate-900/60 to-violet-500/10 " +
      "border border-emerald-500/20 text-slate-50 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_10px_30px_rgba(0,0,0,0.35)]",
    header: "text-emerald-200",
    titleFallback: "Final",
    isFinal: true,
  },
};
