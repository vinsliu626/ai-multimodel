"use client";

import React from "react";
import { NexusOrb } from "@/components/shared/NexusOrb";
import { NoteGenerationProgress } from "./NoteGenerationProgress";
import { NoteRecordPane } from "./NoteRecordPane";
import { NoteResultPane } from "./NoteResultPane";
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

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300">
      <span className="text-slate-500">{label}</span>
      <span className="ml-2 text-slate-100">{value}</span>
    </div>
  );
}

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
  const resultReady = Boolean(ctl.result.trim());
  const helperText =
    ctl.tab === "upload"
      ? "Upload audio and generate structured notes."
      : ctl.tab === "record"
      ? "Record in the browser, then generate notes from the captured audio."
      : "Paste source text and turn it into a concise note summary.";

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <NexusOrb sizeClass="h-6 w-6" />
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-50 md:text-3xl">AI Note</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Generate structured notes from audio or text with a simpler, linear workflow.
              </p>
            </div>
          </div>

          {locked ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              Sign in to use AI Notes.
            </div>
          ) : null}

          {!locked && entitlement ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatPill label="Today" value={`${entitlement.usedNoteGeneratesToday ?? 0}/${entitlement.noteGeneratesPerDay ?? 0}`} />
              <StatPill label="Text limit" value={`${(entitlement.noteInputMaxChars ?? 0).toLocaleString()} chars`} />
              <StatPill label="Item cap" value={`${entitlement.noteMaxItems ?? 0}`} />
            </div>
          ) : null}
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Input</p>
                      <p className="mt-2 text-sm text-slate-300">{helperText}</p>
                    </div>

                    <button
                      onClick={ctl.generateNotes}
                      disabled={!ctl.canGenerate}
                      className="h-11 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none"
                    >
                      {ctl.loading ? "Generating..." : "Generate Notes"}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <NoteTabs
                      tab={ctl.tab}
                      isZh={isZh}
                      recording={ctl.recording}
                      loading={ctl.loading}
                      isLoadingGlobal={isLoadingGlobal}
                      locked={locked}
                      onSwitch={ctl.switchTab}
                    />

                    <div className="rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-400">
                      {ctl.tab === "record"
                        ? `${ctl.recordSecs}s recorded`
                        : ctl.tab === "upload"
                        ? ctl.file?.name || "Ready for upload"
                        : `${ctl.text.trim().length.toLocaleString()} chars`}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
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
                      onResetAll={ctl.resetAll}
                    />
                  ) : null}
                </div>
              </section>

              {ctl.error && !ctl.loading ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-200">{ctl.error}</div>
              ) : null}
            </div>

            <div className="space-y-6">
              <NoteGenerationProgress
                isZh={isZh}
                loading={ctl.loading}
                progress={resultReady ? 100 : ctl.displayProgress}
                stage={resultReady ? "done" : ctl.displayStage}
                resultReady={resultReady}
                error={ctl.loading ? null : ctl.error}
              />

              <NoteResultPane
                isZh={isZh}
                result={ctl.result}
                loading={ctl.loading}
                error={ctl.error}
                success={ctl.success}
                progressStage={ctl.displayStage}
                progressPercent={ctl.displayProgress}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 via-cyan-500/5 to-transparent" />
      </div>
    </div>
  );
}
