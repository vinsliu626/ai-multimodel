"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { extractDocumentText } from "./extractors";
import type { StudyEntitlement, StudyMode, StudyQuizType, StudyResult, StudySessionListItem } from "./study-types";

function modeLabel(mode: StudyMode) {
  if (mode === "notes") return "Notes";
  if (mode === "flashcards") return "Flashcards";
  return "Quiz";
}

function quizTypeLabel(type: StudyQuizType) {
  if (type === "multiple_choice") return "Multiple Choice";
  if (type === "fill_blank") return "Fill in the Blank";
  return "Matching";
}

function inferModeLimit(entitlement: StudyEntitlement | null) {
  if (!entitlement) return 0;
  if (typeof entitlement.studyMaxSelectableModes === "number") return entitlement.studyMaxSelectableModes;
  if (entitlement.plan === "basic") return 2;
  return 3;
}

function userFriendlyStudyError(errorCode: string | undefined, fallback: string) {
  if (errorCode === "STUDY_QUOTA_EXCEEDED") {
    return "You've used all AI Study generations for today. Upgrade your plan or come back tomorrow for more generations.";
  }
  if (errorCode === "STUDY_COOLDOWN_ACTIVE") {
    return "Please wait a short moment before generating another document study set.";
  }
  return fallback || "Please try again later.";
}

export function useStudyController({
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
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [usageRemainingOverride, setUsageRemainingOverride] = useState<number | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [detectedTitle, setDetectedTitle] = useState("");
  const [quizTypes, setQuizTypes] = useState<StudyQuizType[]>(["multiple_choice", "fill_blank"]);
  const [selectedModes, setSelectedModes] = useState<StudyMode[]>(["notes", "quiz"]);
  const [status, setStatus] = useState<string>("");
  const [localExtractionWarning, setLocalExtractionWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<StudySessionListItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const modeLimit = inferModeLimit(entitlement);

  const remainingToday = useMemo(() => {
    if (!entitlement) return 0;
    if (usageRemainingOverride !== null) return usageRemainingOverride;
    return Math.max(0, entitlement.studyGenerationsPerDay - entitlement.usedStudyCountToday);
  }, [entitlement, usageRemainingOverride]);

  const limits = entitlement
    ? {
        maxFileSizeBytes: entitlement.studyMaxFileSizeBytes,
        maxQuizQuestions: entitlement.studyMaxQuizQuestions,
        maxExtractedChars: entitlement.studyMaxExtractedChars,
        allowedDifficulties: entitlement.studyAllowedDifficulties,
        maxSelectableModes: modeLimit,
      }
    : null;

  const canGenerate = Boolean(
    file &&
      extractedText &&
      selectedModes.length > 0 &&
      (!selectedModes.includes("quiz") || quizTypes.length > 0) &&
      !extracting &&
      !generating &&
      !locked &&
      entitlement &&
      remainingToday > 0
  );

  const syncUsage = useCallback(async () => {
    if (!entitlement || locked) return;
    try {
      const res = await fetch("/api/study/usage", { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setUsageRemainingOverride(Number(data.remainingToday));
      }
    } catch {
      // keep last UI value on transient fetch errors
    }
  }, [entitlement, locked]);

  const loadHistory = useCallback(async () => {
    if (locked || !entitlement) {
      setHistory([]);
      return;
    }

    try {
      setHistoryLoading(true);
      const res = await fetch("/api/study/sessions", { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setHistory([]);
        return;
      }
      setHistory(Array.isArray(data?.sessions) ? data.sessions : []);
    } finally {
      setHistoryLoading(false);
    }
  }, [entitlement, locked]);

  useEffect(() => {
    void syncUsage();
    void loadHistory();
  }, [syncUsage, loadHistory]);

  function resetOutput() {
    setError(null);
    setResult(null);
    setActiveHistoryId(null);
  }

  async function handleFileSelection(nextFile: File | null) {
    resetOutput();
    setLocalExtractionWarning(null);
    setExtractedText("");
    setStatus("");
    setFile(nextFile);
    setDetectedTitle(nextFile ? nextFile.name.replace(/\.[^.]+$/, "") : "");

    if (!nextFile) return;
    if (!limits) {
      setError(isZh ? "Could not load your plan limits." : "Could not load your plan limits.");
      return;
    }
    if (nextFile.size > limits.maxFileSizeBytes) {
      setError(`File is too large for your current plan. Limit: ${Math.round(limits.maxFileSizeBytes / (1024 * 1024))} MB.`);
      return;
    }

    setExtracting(true);
    setStatus("Extracting document text...");

    try {
      const text = (await extractDocumentText(nextFile)).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) {
        throw new Error("No readable text was extracted from this document.");
      }
      setExtractedText(text);
      if (text.length > limits.maxExtractedChars) {
        setLocalExtractionWarning("Your document was too long, so only the most relevant portion was used.");
      }
      setStatus("Document extracted and ready for study generation.");
    } catch (extractError) {
      const message = extractError instanceof Error ? extractError.message : "Failed to extract document text.";
      setError(message);
      setFile(null);
    } finally {
      setExtracting(false);
    }
  }

  function toggleMode(mode: StudyMode) {
    setError(null);
    setSelectedModes((prev) => {
      const has = prev.includes(mode);
      if (has) return prev.filter((item) => item !== mode);
      if (!limits) return prev;
      if (prev.length >= limits.maxSelectableModes) {
        setError(`Your plan allows up to ${limits.maxSelectableModes} generation mode${limits.maxSelectableModes > 1 ? "s" : ""}.`);
        return prev;
      }
      return [...prev, mode];
    });
  }

  function toggleQuizType(type: StudyQuizType) {
    setError(null);
    setQuizTypes((prev) => {
      const has = prev.includes(type);
      if (has) {
        if (prev.length <= 1) {
          setError("Choose at least one quiz type.");
          return prev;
        }
        return prev.filter((item) => item !== type);
      }
      return [...prev, type];
    });
  }

  async function loadHistorySession(sessionId: string) {
    if (!sessionId) return;

    setError(null);
    setLoadingSessionId(sessionId);
    try {
      const res = await fetch(`/api/study/session/${sessionId}`, { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Failed to load study history item.");
      }

      const session = data.session as {
        id: string;
        title: string;
        selectedModes: StudyMode[];
        selectedQuizTypes?: StudyQuizType[];
        resultJson: StudyResult;
      };

      setResult(session.resultJson);
      setDetectedTitle(session.title);
      setSelectedModes(session.selectedModes || ["notes", "quiz"]);
      setQuizTypes(
        (session.selectedQuizTypes && session.selectedQuizTypes.length > 0
          ? session.selectedQuizTypes
          : session.resultJson.meta?.selectedQuizTypes) || ["multiple_choice", "fill_blank"]
      );
      setActiveHistoryId(session.id);
      setStatus("Loaded from study history.");
    } catch (sessionError) {
      const message = sessionError instanceof Error ? sessionError.message : "Failed to load study history item.";
      setError(message);
    } finally {
      setLoadingSessionId(null);
    }
  }

  async function renameHistorySession(sessionId: string) {
    const existing = history.find((item) => item.id === sessionId);
    if (!existing) return;

    const next = prompt("New title", existing.title || "");
    if (!next?.trim()) return;

    const res = await fetch(`/api/study/session/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: next.trim() }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message || "Failed to rename study item.");
      return;
    }

    if (activeHistoryId === sessionId) {
      setDetectedTitle(next.trim());
    }
    await loadHistory();
  }

  async function deleteHistorySession(sessionId: string) {
    const ok = confirm("Delete this study history item?");
    if (!ok) return;

    const res = await fetch(`/api/study/session/${sessionId}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message || "Failed to delete study item.");
      return;
    }

    if (activeHistoryId === sessionId) {
      setActiveHistoryId(null);
      setResult(null);
    }
    await loadHistory();
  }

  async function generate() {
    if (!canGenerate || !file || !entitlement || !limits) return;

    resetOutput();
    setGenerating(true);
    setStatus("Generating study materials...");

    try {
      const boundedQuizTypes = Array.from(new Set(quizTypes));

      if (selectedModes.includes("quiz") && boundedQuizTypes.length === 0) {
        setError("Choose at least one quiz type.");
        setGenerating(false);
        return;
      }

      const res = await fetch("/api/study/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          extractedText,
          title: detectedTitle || file.name.replace(/\.[^.]+$/, ""),
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type,
          selectedModes,
          quizTypes: selectedModes.includes("quiz") ? boundedQuizTypes : undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const message = userFriendlyStudyError(data?.error, data?.message || "Study generation failed.");
        throw new Error(message);
      }

      setResult({
        notes: data.notes,
        flashcards: data.flashcards,
        quiz: data.quiz,
        meta: data.meta,
      });
      if (data.usage) {
        setUsageRemainingOverride(Number(data.usage.remainingToday));
      }
      setStatus("Study materials generated.");
      await Promise.all([onUsageRefresh(), syncUsage(), loadHistory()]);
      setActiveHistoryId(data?.session?.id ?? null);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Study generation failed.";
      setError(message);
      setStatus("");
      await Promise.all([onUsageRefresh(), syncUsage()]);
    } finally {
      setGenerating(false);
    }
  }

  return {
    file,
    dragActive,
    extracting,
    generating,
    historyLoading,
    loadingSessionId,
    error,
    result,
    extractedText,
    detectedTitle,
    quizTypes,
    selectedModes,
    status,
    localExtractionWarning,
    remainingToday,
    canGenerate,
    limits,
    modeLimit,
    history,
    activeHistoryId,
    modeLabel,
    quizTypeLabel,
    setDragActive,
    setDetectedTitle,
    handleFileSelection,
    generate,
    toggleMode,
    toggleQuizType,
    loadHistorySession,
    renameHistorySession,
    deleteHistorySession,
  };
}
