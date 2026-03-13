"use client";

import { useEffect, useRef } from "react";
import { useStudyController } from "./useStudyController";
import { StudyUsageStatus } from "./StudyUsageStatus";
import { StudyResults } from "./StudyResults";
import type { StudyEntitlement } from "./study-types";

export function StudyUI({
  isZh,
  locked,
  entitlement,
  onUsageRefresh,
}: {
  isZh: boolean;
  locked: boolean;
  entitlement: StudyEntitlement | null;
  onUsageRefresh: () => Promise<void> | void;
}) {
  const ctl = useStudyController({ isZh, locked, entitlement, onUsageRefresh });
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOpenHistory = () => {
      historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("study:open-history", onOpenHistory);
    return () => window.removeEventListener("study:open-history", onOpenHistory);
  }, []);

  return (
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="relative h-full w-full rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/40 via-slate-900/30 to-slate-950/40 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">Document Study Assistant</h2>
            <button
              type="button"
              onClick={() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 transition"
            >
              Study History
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Upload a PDF, DOCX, or PPTX document, extract text in the browser, then generate notes, flashcards, and real quiz sets.
          </p>
          {locked && (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              Sign in to use document study generation.
            </div>
          )}
          {!locked && entitlement && ctl.remainingToday <= 0 && (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              You&apos;ve used all Document Study generations for today. Upgrade your plan or come back tomorrow for more generations.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {entitlement ? <StudyUsageStatus entitlement={entitlement} remainingToday={ctl.remainingToday} modeLimit={ctl.modeLimit} /> : null}

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div ref={historyRef} className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Study History</p>
                      <p className="mt-1 text-sm text-slate-300">Open previous study results without consuming quota.</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                      {ctl.activeHistoryId ? "Loaded" : "Recent"}
                    </div>
                  </div>

                  <div className="mt-3 max-h-44 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {ctl.historyLoading ? (
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">Loading history...</div>
                    ) : ctl.history.length === 0 ? (
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">No study history yet.</div>
                    ) : (
                      ctl.history.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-2xl border px-3 py-2 text-xs transition ${
                            ctl.activeHistoryId === item.id
                              ? "border-blue-400/70 bg-blue-500/10"
                              : "border-white/8 bg-white/[0.03]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              onClick={() => void ctl.loadHistorySession(item.id)}
                              disabled={ctl.loadingSessionId === item.id}
                              className="text-left min-w-0"
                            >
                              <p className="truncate font-medium text-slate-100">{item.title}</p>
                              <p className="mt-1 truncate text-slate-400">{item.fileName || "Unknown file"}</p>
                              <p className="mt-1 text-slate-500">
                                {new Date(item.createdAt).toLocaleString()} - {item.selectedModes.map(ctl.modeLabel).join(", ")}
                                {item.selectedQuizTypes?.length ? ` - ${item.selectedQuizTypes.map(ctl.quizTypeLabel).join(", ")}` : ""}
                              </p>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => void ctl.renameHistorySession(item.id)}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300"
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => void ctl.deleteHistorySession(item.id)}
                                className="rounded-full border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    ctl.setDragActive(true);
                  }}
                  onDragLeave={() => ctl.setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    ctl.setDragActive(false);
                    void ctl.handleFileSelection(event.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`mt-4 rounded-3xl border border-dashed px-6 py-10 text-center transition ${
                    ctl.dragActive ? "border-blue-400/70 bg-blue-500/10" : "border-white/10 bg-slate-950/60"
                  }`}
                >
                  <div className="mx-auto h-14 w-14 rounded-3xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 opacity-90 shadow-lg shadow-blue-500/30 flex items-center justify-center">
                    <span className="text-white text-2xl">+</span>
                  </div>
                  <p className="mt-4 text-lg font-semibold text-slate-50">
                    {ctl.file ? ctl.file.name : "Drop a document here or choose a file"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    PDF / DOCX / PPTX - {entitlement ? `${(entitlement.studyMaxFileSizeBytes / (1024 * 1024)).toFixed(0)} MB max` : ""}
                  </p>
                  <label className="mt-5 inline-flex cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      onChange={(event) => void ctl.handleFileSelection(event.target.files?.[0] ?? null)}
                    />
                    Choose document
                  </label>
                </div>

                {ctl.status ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">{ctl.status}</div>
                ) : null}
                {ctl.localExtractionWarning ? (
                  <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                    {ctl.localExtractionWarning}
                  </div>
                ) : null}
                {ctl.error ? (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{ctl.error}</div>
                ) : null}

                {ctl.extractedText ? (
                  <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Extraction</p>
                        <p className="mt-2 text-sm text-slate-200">{ctl.extractedText.length.toLocaleString()} characters extracted</p>
                      </div>
                      <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">
                        {ctl.extracting ? "Extracting" : "Ready"}
                      </div>
                    </div>
                    <div className="mt-4 max-h-44 overflow-y-auto rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 custom-scrollbar">
                      {ctl.extractedText.slice(0, 1600)}
                      {ctl.extractedText.length > 1600 ? "..." : ""}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Settings</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-50">Generation Controls</h3>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Title</label>
                    <input
                      value={ctl.detectedTitle}
                      onChange={(event) => ctl.setDetectedTitle(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Generate</label>
                    <div className="flex flex-wrap gap-2">
                      {(["notes", "flashcards", "quiz"] as const).map((mode) => {
                        const selected = ctl.selectedModes.includes(mode);
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => ctl.toggleMode(mode)}
                            className={`rounded-full px-3 py-2 text-sm transition ${
                              selected
                                ? "bg-white text-black"
                                : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                            }`}
                          >
                            {mode === "notes" ? "Notes" : mode === "flashcards" ? "Flashcards" : "Quiz"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Select up to {ctl.modeLimit} mode{ctl.modeLimit > 1 ? "s" : ""} on your plan.</p>
                  </div>

                  {ctl.selectedModes.includes("quiz") && (
                    <>
                      <div>
                        <label className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">Quiz Types</label>
                        <div className="flex flex-wrap gap-2">
                          {(["multiple_choice", "fill_blank", "matching"] as const).map((type) => {
                            const selected = ctl.quizTypes.includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => ctl.toggleQuizType(type)}
                                className={`rounded-full px-3 py-2 text-sm transition ${
                                  selected
                                    ? "bg-white text-black"
                                    : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                                }`}
                              >
                                {ctl.quizTypeLabel(type)}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">Choose at least one quiz type.</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                        <p className="font-medium text-slate-100">Quiz quality is fixed to standard study / exam review.</p>
                        <p className="mt-1 text-slate-400">
                          Target question count: up to {ctl.limits?.maxQuizQuestions ?? 10}, based on how much real quiz-worthy material exists in the document.
                        </p>
                      </div>
                    </>
                  )}

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
                    <p>Remaining today: {ctl.remainingToday}</p>
                    <p className="mt-1">Max chars sent: {ctl.limits?.maxExtractedChars.toLocaleString() ?? 0}</p>
                    <p className="mt-1">Selected modes: {ctl.selectedModes.length ? ctl.selectedModes.map(ctl.modeLabel).join(", ") : "None"}</p>
                  </div>

                  <button
                    onClick={() => void ctl.generate()}
                    disabled={!ctl.canGenerate}
                    className="h-11 w-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white text-sm font-semibold shadow-md shadow-blue-500/30 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 transition"
                  >
                    {ctl.generating ? "Generating..." : ctl.extracting ? "Extracting..." : "Generate study content"}
                  </button>
                </div>
              </div>
            </div>

            {ctl.result ? (
              <StudyResults result={ctl.result} />
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-slate-300">
                  *
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-50">Ready for study generation</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Upload a document, pick modes, then generate notes, flashcards, and a structured quiz.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
