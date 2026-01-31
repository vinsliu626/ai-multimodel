"use client";

import React from "react";
import { PillSelect, PillOption } from "@/components/chat/ui/PillSelect";

type Mode = "single" | "team" | "detector" | "note";
type ModelKind = "fast" | "quality";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";

export function TopControls({
  isZh,
  isLoading,
  sessionExists,

  mode,
  setMode,

  modelKind,
  setModelKind,

  singleModelKey,
  setSingleModelKey,

  onOpenPlan,

  status,
  userInitial,
  userLabel,
  onSignIn,
  onSignOut,
}: {
  isZh: boolean;
  isLoading: boolean;
  sessionExists: boolean;

  mode: Mode;
  setMode: (m: Mode) => void;

  modelKind: ModelKind;
  setModelKind: (k: ModelKind) => void;

  singleModelKey: SingleModelKey;
  setSingleModelKey: (k: SingleModelKey) => void;

  onOpenPlan: () => void;

  status: "loading" | "authenticated" | "unauthenticated";
  userInitial: string;
  userLabel: string;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const modeOptions: PillOption[] = [
    { value: "single", label: isZh ? "单模型" : "Single model" },
    { value: "team", label: isZh ? "团队协作" : "Team / multi-agent" },
    { value: "detector", label: isZh ? "AI 检测器" : "AI Detector" },
    { value: "note", label: isZh ? "AI 笔记" : "AI Note" },
  ];

  const singleModelOptions: PillOption[] = [
    { value: "groq_fast", label: `Groq · ${isZh ? "快速" : "Fast"}` },
    { value: "groq_quality", label: `Groq · ${isZh ? "高质量" : "Pro"}` },
    { value: "hf_deepseek", label: "DeepSeek" },
    { value: "hf_kimi", label: "Kimi" },
  ];

  const teamQualityOptions: PillOption[] = [
    { value: "fast", label: isZh ? "快速" : "Fast" },
    { value: "quality", label: isZh ? "高质量" : "High quality" },
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-2xl bg-slate-900/80 border border-white/10 shadow-sm">
        <div className="flex flex-col gap-1 text-[11px] min-w-[160px]">
          <span className="text-slate-400">{isZh ? "运行模式" : "Mode"}</span>
          <PillSelect
            value={mode}
            options={modeOptions}
            onChange={(v) => setMode(v as Mode)}
            disabled={isLoading}
          />
        </div>

        <div className="h-8 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

        <div className="flex flex-col gap-1 text-[11px] min-w-[180px]">
          <span className="text-slate-400">
            {mode === "single"
              ? isZh
                ? "单模型选择"
                : "Model"
              : mode === "team"
              ? isZh
                ? "团队质量"
                : "Team quality"
              : mode === "detector"
              ? isZh
                ? "检测语言"
                : "Language"
              : isZh
              ? "笔记输入"
              : "Input"}
          </span>

          {mode === "single" ? (
            <PillSelect value={singleModelKey} options={singleModelOptions} onChange={(v) => setSingleModelKey(v as SingleModelKey)} disabled={isLoading} />
          ) : mode === "team" ? (
            <PillSelect value={modelKind} options={teamQualityOptions} onChange={(v) => setModelKind(v as ModelKind)} disabled={isLoading} />
          ) : mode === "detector" ? (
            <div className="w-full rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50">
              English only
            </div>
          ) : (
            <div className="w-full rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50">
              {isZh ? "音频 / 录音 / 文本" : "Audio / Record / Text"}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onOpenPlan}
        className="md:hidden px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-100 hover:bg-white/10 transition"
      >
        {isZh ? "套餐" : "Plan"}
      </button>

      <div className="flex items-center gap-2">
        {status === "loading" ? (
          <div className="h-8 w-8 rounded-full bg-slate-800 animate-pulse" />
        ) : status === "authenticated" ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-xs font-semibold text-white shadow-md shadow-blue-500/40">
              {userInitial}
            </div>
            <div className="hidden sm:flex flex-col text-[11px] leading-tight">
              <span className="text-slate-100 truncate max-w-[120px]">{userLabel}</span>
              <button onClick={onSignOut} className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline">
                {isZh ? "退出登录" : "Sign out"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onSignIn}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-xs font-medium text-white shadow-md shadow-blue-500/40 hover:brightness-110 transition-all"
          >
            {isZh ? "登录 / 注册" : "Sign in / Sign up"}
          </button>
        )}
      </div>
    </div>
  );
}