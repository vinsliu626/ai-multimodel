"use client";

import React from "react";
import { NoteResultPane } from "./NoteResultPane";
import { NoteRecordPane } from "./NoteRecordPane";
import { NoteTabs } from "./NoteTabs";
import { NoteTextPane } from "./NoteTextPane";
import { NoteUploadPane } from "./NoteUploadPane";
import { useNoteController } from "./useNoteController";

type NoteEntitlement = {
  plan: "basic" | "pro" | "ultra" | "gift";
  noteGeneratesPerDay?: number;
  noteInputMaxChars?: number;
  noteMaxItems?: number;
  noteCooldownMs?: number;
  usedNoteGeneratesToday?: number;
};

export function NoteUI({
  isLoadingGlobal,
  isZh,
  locked,
  entitlement,
  onUsageRefresh,
}: {
  isLoadingGlobal: boolean;
  isZh: boolean;
  locked: boolean;
  entitlement?: NoteEntitlement | null;
  onUsageRefresh?: () => Promise<void> | void;
}) {
  const ctl = useNoteController({ locked, isLoadingGlobal, isZh, onUsageRefresh });

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">
            {isZh ? "AI 笔记助手" : "AI Note Assistant"}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {isZh
              ? "录音、上传音频或粘贴文本，自动整理成结构化学习笔记。"
              : "Record, upload audio, or paste text to turn it into structured study notes."}
          </p>

          {locked ? (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              {isZh ? "请先登录后使用 AI 笔记。" : "Sign in to use AI Notes."}
            </div>
          ) : null}

          {!locked && entitlement ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-300">
                <div className="text-slate-500">{isZh ? "今日次数" : "Today"}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {entitlement.usedNoteGeneratesToday ?? 0}/{entitlement.noteGeneratesPerDay ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-300">
                <div className="text-slate-500">{isZh ? "文本上限" : "Text limit"}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {(entitlement.noteInputMaxChars ?? 0).toLocaleString()} {isZh ? "字符" : "chars"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-300">
                <div className="text-slate-500">{isZh ? "条目上限" : "Item cap"}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{entitlement.noteMaxItems ?? 0}</div>
              </div>
            </div>
          ) : null}
        </div>

        {ctl.error ? (
          <div className="px-6 pt-4">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {ctl.error}
            </div>
          </div>
        ) : null}

        {ctl.chunkError && ctl.tab === "record" ? (
          <div className="px-6 pt-4">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {isZh ? `分片上传失败：${ctl.chunkError}` : `Chunk upload failed: ${ctl.chunkError}`}
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden p-4">
          <div className="h-full rounded-3xl p-[1px] bg-gradient-to-r from-blue-500/50 via-purple-500/40 to-cyan-400/40">
            <div className="h-full rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
              <div className="px-4 py-4 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <NoteTabs
                  tab={ctl.tab}
                  isZh={isZh}
                  recording={ctl.recording}
                  loading={ctl.loading}
                  isLoadingGlobal={isLoadingGlobal}
                  locked={locked}
                  onSwitch={ctl.switchTab}
                />

                <button
                  onClick={ctl.generateNotes}
                  disabled={!ctl.canGenerate}
                  className="h-10 px-5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white text-sm font-semibold shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                >
                  {ctl.loading ? (isZh ? "生成中..." : "Generating...") : isZh ? "生成笔记" : "Generate notes"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
                <div className="mx-auto max-w-3xl">
                  <div className="text-center">
                    <div className="mx-auto h-14 w-14 rounded-3xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 opacity-90 shadow-lg shadow-blue-500/30 flex items-center justify-center">
                      <span className="text-white text-2xl">N</span>
                    </div>
                    <p className="mt-4 text-lg font-semibold text-slate-50">
                      {ctl.tab === "upload"
                        ? isZh
                          ? "上传音频并生成笔记"
                          : "Upload audio to generate notes"
                        : ctl.tab === "record"
                        ? isZh
                          ? "浏览器录音并生成笔记"
                          : "Record in browser to generate notes"
                        : isZh
                        ? "粘贴文本并生成笔记"
                        : "Paste text to generate notes"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {isZh ? "输出会整理成 TL;DR、要点、行动项和复习清单。" : "Output includes TL;DR, key points, action items, and a review checklist."}
                    </p>
                  </div>

                  <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
                    {ctl.tab === "upload" ? (
                      <NoteUploadPane
                        isZh={isZh}
                        loading={ctl.loading}
                        isLoadingGlobal={isLoadingGlobal}
                        file={ctl.file}
                        onPickFile={ctl.onPickFile}
                      />
                    ) : null}

                    {ctl.tab === "record" ? (
                      <NoteRecordPane
                        isZh={isZh}
                        locked={locked}
                        loading={ctl.loading}
                        isLoadingGlobal={isLoadingGlobal}
                        recording={ctl.recording}
                        recordSecs={ctl.recordSecs}
                        noteId={ctl.noteId}
                        uploadedChunks={ctl.uploadedChunks}
                        liveTranscript={ctl.liveTranscript}
                        finalizeStage={ctl.finalizeStage}
                        finalizeProgress={ctl.finalizeProgress}
                        onStart={ctl.startRecording}
                        onStop={ctl.stopRecording}
                      />
                    ) : null}

                    {ctl.tab === "text" ? (
                      <NoteTextPane
                        isZh={isZh}
                        loading={ctl.loading}
                        isLoadingGlobal={isLoadingGlobal}
                        locked={locked}
                        text={ctl.text}
                        onChangeText={ctl.setText}
                        onResetAll={() => undefined}
                      />
                    ) : null}
                  </div>

                  <NoteResultPane
                    isZh={isZh}
                    result={ctl.result}
                    loading={ctl.loading}
                    error={ctl.error}
                    success={ctl.success}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-blue-500/10 via-purple-500/5 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
