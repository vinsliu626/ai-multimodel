"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type NoteTab = "upload" | "record" | "text";

export function useNoteController({
  locked,
  isLoadingGlobal,
  isZh,
  onUsageRefresh,
}: {
  locked: boolean;
  isLoadingGlobal: boolean;
  isZh: boolean;
  onUsageRefresh?: () => Promise<void> | void;
}) {
  const finalizeAbortRef = useRef(false);
  const [tab, setTab] = useState<NoteTab>("upload");

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [recordSecs, setRecordSecs] = useState(0);
  const timerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [finalizeStage, setFinalizeStage] = useState<string>("idle");
  const [finalizeProgress, setFinalizeProgress] = useState<number>(0);
  const [displayStage, setDisplayStage] = useState<string>("idle");
  const [displayProgress, setDisplayProgress] = useState<number>(0);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");

  const uploadingRef = useRef<Promise<void>>(Promise.resolve());
  const chunkIndexRef = useRef(0);

  const canGenerate = useMemo(() => {
    if (locked) return false;
    if (loading || isLoadingGlobal) return false;
    if (tab === "upload") return !!file;
    if (tab === "record") return !!noteId && !recording && uploadedChunks > 0 && !chunkError;
    return text.trim().length > 0;
  }, [tab, file, text, loading, isLoadingGlobal, locked, noteId, recording, uploadedChunks, chunkError]);

  function friendlyMessageFromApi(payload: any, fallback: string) {
    const code = String(payload?.error || "");
    if (code === "NOTE_DAILY_LIMIT_REACHED") {
      return isZh ? "今天的 AI Note 次数已经用完了。" : "You've used all AI Note generations for today.";
    }
    if (code === "NOTE_COOLDOWN_ACTIVE") {
      return isZh ? "请稍等片刻后再试。" : "Please wait a moment before sending another request.";
    }
    if (code === "NOTE_INPUT_TOO_LARGE") {
      return isZh ? "这段文本超过了当前套餐限制。" : "This text is too long for your current plan.";
    }
    return payload?.message || fallback;
  }

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function cleanupStream() {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  }

  function resetAll() {
    setError(null);
    setResult("");
    setSuccess(null);
  }

  function resetProgress() {
    stopProgressTimer();
    setFinalizeStage("idle");
    setFinalizeProgress(0);
    setDisplayStage("idle");
    setDisplayProgress(0);
  }

  function startSimulatedProgress() {
    stopProgressTimer();
    setDisplayStage("analyzing");
    setDisplayProgress(8);

    progressTimerRef.current = window.setInterval(() => {
      setDisplayProgress((current) => {
        const next = Math.min(current + (current < 36 ? 8 : current < 64 ? 6 : current < 82 ? 4 : 2), 94);
        if (next < 30) setDisplayStage("analyzing");
        else if (next < 52) setDisplayStage("extracting");
        else if (next < 82) setDisplayStage("summarizing");
        else setDisplayStage("formatting");
        return next;
      });
    }, 1100);
  }

  async function startRecording() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI Note。" : "Please sign in to use AI Notes.");
      return;
    }
    if (recording || loading || isLoadingGlobal) return;

    resetAll();
    setChunkError(null);
    setUploadedChunks(0);
    setLiveTranscript("");
    setRecordSecs(0);
    setNoteId(null);
    resetProgress();

    uploadingRef.current = Promise.resolve();
    chunkIndexRef.current = 0;

    try {
      const startRes = await fetch("/api/ai-note/start", { method: "POST" });
      const startJson = await startRes.json().catch(() => null);
      if (!startRes.ok || !startJson?.ok || !startJson?.noteId) {
        throw new Error(startJson?.error || `start failed: ${startRes.status}`);
      }
      const nid = String(startJson.noteId);
      setNoteId(nid);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferredTypes.find((value) => MediaRecorder.isTypeSupported(value));

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        if (!nid) return;

        const blob = event.data;
        const type = blob.type || mr.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : "webm";
        const thisIndex = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        const fileChunk = new File([blob], `chunk-${thisIndex}.${ext}`, { type });

        uploadingRef.current = uploadingRef.current.then(async () => {
          try {
            const fd = new FormData();
            fd.append("noteId", nid);
            fd.append("chunkIndex", String(thisIndex));
            fd.append("file", fileChunk, fileChunk.name);

            const response = await fetch(`/api/ai-note/chunk?noteId=${encodeURIComponent(nid)}&chunkIndex=${thisIndex}`, {
              method: "POST",
              credentials: "include",
              body: fd,
            });

            const raw = await response.text();
            let json: any = null;
            try {
              json = raw ? JSON.parse(raw) : null;
            } catch {
              json = null;
            }

            if (!response.ok || json?.ok === false) {
              throw new Error(json?.error || json?.message || raw.slice(0, 300) || `chunk upload failed: ${response.status}`);
            }

            setUploadedChunks((count) => count + 1);
            if (json?.transcript) {
              setLiveTranscript((prev) => (prev ? `${prev}\n${String(json.transcript)}` : String(json.transcript)));
            }
          } catch (uploadError: any) {
            setChunkError(uploadError?.message || "chunk upload error");
          }
        });
      };

      mr.onstop = async () => {
        stopTimer();
        try {
          await uploadingRef.current;
        } catch {}
        cleanupStream();
        setRecording(false);
      };

      mr.start(30_000);
      setRecording(true);
      timerRef.current = window.setInterval(() => setRecordSecs((value) => value + 1), 1000);
    } catch (recordError: any) {
      cleanupStream();
      setRecording(false);
      setError(recordError?.message || (isZh ? "无法访问麦克风或当前浏览器不支持录音。" : "Cannot access microphone or the browser does not support recording."));
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    try {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      recorder.stop();
    } catch {
      stopTimer();
      cleanupStream();
      setRecording(false);
    }
  }

  function onPickFile(nextFile: File | null) {
    resetAll();
    resetProgress();

    if (!nextFile) {
      setFile(null);
      return;
    }

    const name = nextFile.name.toLowerCase();
    const okExt =
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".m4a") ||
      name.endsWith(".mp4") ||
      name.endsWith(".webm") ||
      name.endsWith(".ogg") ||
      name.endsWith(".aac") ||
      name.endsWith(".flac");
    const okMime = !nextFile.type || nextFile.type.startsWith("audio/") || nextFile.type === "video/mp4";

    if (!okExt || !okMime) {
      setError(isZh ? "仅支持常见音频格式：mp3 / wav / m4a / mp4 / webm / ogg / aac / flac" : "Supported: mp3 / wav / m4a / mp4 / webm / ogg / aac / flac");
      setFile(null);
      return;
    }

    setFile(nextFile);
  }

  async function generateNotes() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI Note。" : "Please sign in to use AI Notes.");
      return;
    }
    if (!canGenerate) return;
    if (tab === "record" && chunkError) {
      setError(isZh ? `分片上传出错：${chunkError}` : `Chunk upload error: ${chunkError}`);
      return;
    }

    setLoading(true);
    setError(null);
    setResult("");
    setSuccess(null);
    if (tab !== "record") startSimulatedProgress();

    try {
      if (tab === "text") {
        const response = await fetch("/api/ai-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputType: "text", text: text.trim() }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) {
          throw new Error(friendlyMessageFromApi(data, isZh ? "生成笔记失败。" : "Unable to generate notes."));
        }

        stopProgressTimer();
        setDisplayStage("done");
        setDisplayProgress(100);
        setResult(String(data?.note ?? data?.result ?? ""));
        setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
        onUsageRefresh?.();
        return;
      }

      if (tab === "upload") {
        const fd = new FormData();
        fd.append("inputType", "upload");
        if (!file) throw new Error(isZh ? "缺少上传文件。" : "Missing file.");
        fd.append("file", file, file.name);

        const response = await fetch("/api/ai-note", { method: "POST", body: fd });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) {
          throw new Error(friendlyMessageFromApi(data, isZh ? "生成笔记失败。" : "Unable to generate notes."));
        }

        stopProgressTimer();
        setDisplayStage("done");
        setDisplayProgress(100);
        setResult(String(data?.note ?? data?.result ?? ""));
        setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
        onUsageRefresh?.();
        return;
      }

      if (!noteId) {
        throw new Error(isZh ? "缺少 noteId，请重新开始录音。" : "Missing noteId. Please start recording again.");
      }
      if (recording) {
        throw new Error(isZh ? "请先停止录音，再生成笔记。" : "Stop recording before generating notes.");
      }
      if (uploadedChunks <= 0) {
        throw new Error(isZh ? "还没有上传任何分片。" : "No chunks uploaded yet.");
      }

      try {
        await uploadingRef.current;
      } catch {}

      finalizeAbortRef.current = false;
      setFinalizeStage("asr");
      setFinalizeProgress(1);
      setDisplayStage("extracting");
      setDisplayProgress(1);

      const maxAttempts = 180;
      let finalNote = "";

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (finalizeAbortRef.current) {
          throw new Error(isZh ? "生成已取消。" : "Generation cancelled.");
        }

        const response = await fetch("/api/ai-note/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId }),
        });

        const raw = await response.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }

        if (!response.ok || json?.ok === false) {
          const retryAfterMs = Number(json?.retryAfterMs) || Number(json?.extra?.retryAfterMs) || 1500;
          const retryable = response.status === 202 || json?.error === "LOCKED";
          if (retryable && attempt < maxAttempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, retryAfterMs));
            continue;
          }

          const nextProgress = Number.isFinite(json?.progress) ? Number(json.progress) : displayProgress;
          setFinalizeStage("failed");
          setFinalizeProgress(nextProgress);
          setDisplayStage("failed");
          setDisplayProgress(nextProgress);
          throw new Error(friendlyMessageFromApi(json, raw.slice(0, 300) || `Finalize error: ${response.status}`));
        }

        const nextStage = String(json?.stage || "done");
        const nextProgress = Number.isFinite(json?.progress) ? Number(json.progress) : 100;
        setFinalizeStage(nextStage);
        setFinalizeProgress(nextProgress);
        setDisplayStage(nextStage === "asr" ? "extracting" : nextStage === "llm" ? "summarizing" : nextStage === "done" ? "formatting" : nextStage);
        setDisplayProgress(nextProgress);

        if (nextStage === "done") {
          finalNote = String(json?.note ?? json?.result ?? "");
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }

      if (!finalNote) {
        throw new Error(isZh ? "生成超时，请稍后重试。" : "Note generation timed out before completion.");
      }

      setDisplayStage("done");
      setDisplayProgress(100);
      setResult(finalNote);
      setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
      onUsageRefresh?.();
    } catch (generateError: any) {
      stopProgressTimer();
      setDisplayStage("failed");
      setError(generateError?.message || (isZh ? "生成失败。" : "Failed to generate notes."));
    } finally {
      stopProgressTimer();
      setLoading(false);
    }
  }

  function switchTab(next: NoteTab) {
    finalizeAbortRef.current = true;
    if (recording) {
      try {
        void stopRecording();
      } catch {}
    }

    cleanupStream();
    setTab(next);
    resetAll();
    setChunkError(null);
    setUploadedChunks(0);
    setLiveTranscript("");
    setRecordSecs(0);
    setNoteId(null);
    setFile(null);
    resetProgress();
  }

  useEffect(() => {
    return () => {
      finalizeAbortRef.current = true;
      stopTimer();
      stopProgressTimer();
      cleanupStream();
    };
  }, []);

  return {
    tab,
    file,
    text,
    recording,
    recordSecs,
    loading,
    result,
    error,
    success,
    finalizeStage,
    finalizeProgress,
    displayStage,
    displayProgress,
    noteId,
    uploadedChunks,
    chunkError,
    liveTranscript,
    canGenerate,
    setText,
    onPickFile,
    startRecording,
    stopRecording,
    generateNotes,
    switchTab,
    resetAll,
  };
}
