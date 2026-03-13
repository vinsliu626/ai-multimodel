// components/note/useNoteController.ts
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

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // finalize progress (record only)
  const [finalizeStage, setFinalizeStage] = useState<string>("idle"); // idle|asr|summarize|merge|done|failed
  const [finalizeProgress, setFinalizeProgress] = useState<number>(0);

  // chunk upload session
  const [noteId, setNoteId] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>("");

  // serialize uploads
  const uploadingRef = useRef<Promise<void>>(Promise.resolve());
  const chunkIndexRef = useRef(0);

  const canGenerate = useMemo(() => {
    if (locked) return false;
    if (loading || isLoadingGlobal) return false;

    if (tab === "upload") return !!file;

    if (tab === "record") return !!noteId && !recording && uploadedChunks > 0 && !chunkError;

    return text.trim().length > 0;
  }, [tab, file, text, loading, isLoadingGlobal, locked, noteId, recording, uploadedChunks, chunkError]);

  function resetAll() {
    setError(null);
    setResult("");
    setSuccess(null);
  }

  function friendlyMessageFromApi(payload: any, fallback: string) {
    const code = String(payload?.error || "");
    if (code === "NOTE_DAILY_LIMIT_REACHED") {
      return isZh ? "今天的 AI 笔记次数已经用完了。" : "You've used all AI Note generations for today.";
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

  function cleanupStream() {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  }

  async function startRecording() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI 笔记（Basic 有每周额度）。" : "Please sign in to use AI Notes.");
      return;
    }
    if (recording || loading || isLoadingGlobal) return;

    resetAll();

    // reset record states
    setChunkError(null);
    setUploadedChunks(0);
    setLiveTranscript("");
    setRecordSecs(0);
    setNoteId(null);
    setFinalizeStage("idle");
    setFinalizeProgress(0);

    uploadingRef.current = Promise.resolve();
    chunkIndexRef.current = 0;

    try {
      // 1) start session：拿 noteId
      const startRes = await fetch("/api/ai-note/start", { method: "POST" });
      const startJson = await startRes.json().catch(() => null);
      if (!startRes.ok || !startJson?.ok || !startJson?.noteId) {
        throw new Error(startJson?.error || `start failed: ${startRes.status}`);
      }
      const nid = String(startJson.noteId);
      setNoteId(nid);

      // 2) open mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        if (!nid) return;

        const blob = e.data;
        const type = blob.type || mr.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : "webm";

        const thisIndex = chunkIndexRef.current;
        chunkIndexRef.current += 1;

        const f = new File([blob], `chunk-${thisIndex}.${ext}`, { type });
        console.log("[chunk upload]", { nid, thisIndex, size: f.size, type: f.type });

        uploadingRef.current = uploadingRef.current.then(async () => {
          try {
            const fd = new FormData();
            fd.append("noteId", nid);
            fd.append("chunkIndex", String(thisIndex));
            fd.append("file", f, f.name);

            const url = `/api/ai-note/chunk?noteId=${encodeURIComponent(nid)}&chunkIndex=${thisIndex}`;

            const r = await fetch(url, {
              method: "POST",
              credentials: "include",
              body: fd,
            });

            const raw = await r.text();

            let j: any = null;
            try {
              j = raw ? JSON.parse(raw) : null;
            } catch {
              j = null;
            }

            console.log("[chunk upload ok]", { status: r.status, json: j });

            if (!r.ok || j?.ok === false) {
              const backendMsg =
                j?.error ||
                j?.message ||
                (raw ? raw.slice(0, 300) : "") ||
                `chunk upload failed: ${r.status}`;
              throw new Error(`chunk upload failed (${r.status}) :: ${backendMsg}`);
            }

            setUploadedChunks((n) => n + 1);

            if (j?.transcript) {
              setLiveTranscript((prev) => (prev ? prev + "\n" : "") + String(j.transcript));
            }
          } catch (err: any) {
            console.error("chunk upload error:", err);
            setChunkError(err?.message || "chunk upload error");
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

      timerRef.current = window.setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    } catch (e: any) {
      console.error("startRecording error:", e);
      cleanupStream();
      setRecording(false);
      setError(
        e?.message ||
          (isZh
            ? "无法打开麦克风权限（或浏览器不支持录音）。"
            : "Cannot access microphone (or browser unsupported).")
      );
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    try {
      if (mr.state === "recording") {
        try {
          mr.requestData();
        } catch {}
        await new Promise((r) => setTimeout(r, 0));
      }
      mr.stop();
    } catch (e) {
      console.error("stopRecording error:", e);
      stopTimer();
      cleanupStream();
      setRecording(false);
    }
  }

  function onPickFile(f: File | null) {
    resetAll();
    if (!f) {
      setFile(null);
      return;
    }

    const name = f.name.toLowerCase();
    const okExt =
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".m4a") ||
      name.endsWith(".mp4") ||
      name.endsWith(".webm") ||
      name.endsWith(".ogg") ||
      name.endsWith(".aac") ||
      name.endsWith(".flac");

    const okMime = !f.type || f.type.startsWith("audio/") || f.type === "video/mp4";

    if (!okExt || !okMime) {
      setError(
        isZh
          ? "仅支持常见音频格式：mp3 / wav / m4a / mp4 / webm / ogg / aac / flac"
          : "Supported: mp3 / wav / m4a / mp4 / webm / ogg / aac / flac"
      );
      setFile(null);
      return;
    }

    setFile(f);
  }

  async function generateNotes() {
    if (locked) {
      setError(isZh ? "请先登录后使用 AI 笔记。" : "Please sign in to use AI Notes.");
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

    try {
      // Text
      if (tab === "text") {
        const res = await fetch("/api/ai-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputType: "text", text: text.trim() }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(friendlyMessageFromApi(data, isZh ? "生成笔记失败。" : "Unable to generate notes."));
        }
        setResult(String(data?.note ?? data?.result ?? ""));
        setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
        onUsageRefresh?.();
        return;
      }

      // Upload
      if (tab === "upload") {
        const fd = new FormData();
        fd.append("inputType", "upload");
        if (!file) throw new Error(isZh ? "缺少上传文件" : "Missing file");
        fd.append("file", file, file.name);

        const res = await fetch("/api/ai-note", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(friendlyMessageFromApi(data, isZh ? "生成笔记失败。" : "Unable to generate notes."));
        }
        setResult(String(data?.note ?? data?.result ?? ""));
        setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
        onUsageRefresh?.();
        return;
      }

      // Record finalize
      if (tab === "record") {
        if (!noteId) {
          throw new Error(isZh ? "缺少 noteId：请重新开始录音。" : "Missing noteId: please start recording again.");
        }
        if (recording) {
          throw new Error(isZh ? "请先停止录音，再生成笔记。" : "Stop recording before generating notes.");
        }
        if (uploadedChunks <= 0) {
          throw new Error(isZh ? "没有上传任何分片，无法生成。" : "No chunks uploaded yet.");
        }

        try {
          await uploadingRef.current;
        } catch {}

        finalizeAbortRef.current = false;
        setFinalizeStage("asr");
        setFinalizeProgress(1);

        const maxAttempts = 180;
        let finalNote = "";

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (finalizeAbortRef.current) {
            throw new Error(isZh ? "生成已取消。" : "Generation cancelled.");
          }

          const r = await fetch("/api/ai-note/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId }),
          });

          const raw = await r.text();
          let j: any = null;
          try {
            j = raw ? JSON.parse(raw) : null;
          } catch {
            j = null;
          }

          if (!r.ok || j?.ok === false) {
            const retryAfterMs = Number(j?.retryAfterMs) || Number(j?.extra?.retryAfterMs) || 1500;
            const retryable = r.status === 202 || j?.error === "LOCKED";
            if (retryable && attempt < maxAttempts - 1) {
              await new Promise((resolve) => window.setTimeout(resolve, retryAfterMs));
              continue;
            }

            const msg =
              friendlyMessageFromApi(j, "") ||
              (raw ? raw.slice(0, 300) : "") ||
              `Finalize error: ${r.status}`;
            setFinalizeStage("failed");
            if (Number.isFinite(j?.progress)) {
              setFinalizeProgress(Number(j.progress));
            }
            throw new Error(msg);
          }

          setFinalizeStage(String(j?.stage || "done"));
          setFinalizeProgress(Number.isFinite(j?.progress) ? Number(j.progress) : 100);

          if (j?.stage === "done") {
            finalNote = String(j?.note ?? j?.result ?? "");
            break;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }

        if (!finalNote) {
          throw new Error(isZh ? "生成超时，请稍后重试。" : "Note generation timed out before completion.");
        }

        setResult(finalNote);
        setSuccess(isZh ? "笔记已生成。" : "Notes generated.");
        onUsageRefresh?.();
        return;
      }

      throw new Error(isZh ? "未知的输入类型" : "Unknown input type");
    } catch (e: any) {
      setError(e?.message || (isZh ? "生成失败。" : "Failed to generate notes."));
    } finally {
      setLoading(false);
    }
  }

  function switchTab(next: NoteTab) {
    finalizeAbortRef.current = true;
    // ✅ 切换 tab 前清理录音
    if (recording) {
      try {
        stopRecording();
        setFinalizeStage("idle");
        setFinalizeProgress(0);
      } catch {}
    }
    cleanupStream();

    setTab(next);
    resetAll();

    // reset record-related
    setChunkError(null);
    setUploadedChunks(0);
    setLiveTranscript("");
    setRecordSecs(0);
    setNoteId(null);
  }

  // safety cleanup on unmount
  useEffect(() => {
    return () => {
      finalizeAbortRef.current = true;
      try {
        stopTimer();
      } catch {}
      try {
        cleanupStream();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // state
    tab,
    file,
    text,
    recording,
    recordSecs,
    loading,
    result,
    error,
    success,
    noteId,
    uploadedChunks,
    chunkError,
    liveTranscript,
    finalizeStage,
    finalizeProgress,
    canGenerate,

    // setters/actions
    setText,
    onPickFile,
    startRecording,
    stopRecording,
    generateNotes,
    switchTab,
  };
}
