// app/api/ai-note/finalize/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { devBypassUserId } from "@/lib/auth/devBypass";

import fssync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { callGroqTranscribe } from "@/lib/ai/groq";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";
import { assertNoteRequestAllowed, markNoteAttempt, NoteLimitError, recordNoteGenerateSuccess } from "@/lib/aiNote/quota";
import { parseEnvInt } from "@/lib/env/number";

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 单次最多 5 分钟，靠 stepper 多次推进

type ApiErr =
  | "AUTH_REQUIRED"
  | "MISSING_NOTE_ID"
  | "NOTE_NOT_FOUND"
  | "FORBIDDEN"
  | "NO_CHUNKS"
  | "CHUNKS_NOT_CONTIGUOUS"
  | "FFMPEG_FAILED"
  | "ASR_FAILED"
  | "LLM_FAILED"
  | "INTERNAL_ERROR"
  | "LOCKED";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT:${label}:${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

function firstExisting(paths: string[]) {
  for (const p of paths) {
    try {
      if (p && fssync.existsSync(p)) return p;
    } catch {}
  }
  return "";
}

async function ensureExecutable(binPath: string) {
  if (!binPath) return;
  if (process.platform === "win32") return;
  try {
    await fs.chmod(binPath, 0o755);
  } catch {}
}

function getFfmpegBin() {
  const envPath = (process.env.FFMPEG_PATH || "").trim();
  if (envPath && fssync.existsSync(envPath)) return envPath;

  const cwd = process.cwd();
  const isWin = process.platform === "win32";
  const exe = isWin ? "ffmpeg.exe" : "ffmpeg";

  const candidates = [
    path.join(cwd, "node_modules", "ffmpeg-static", exe),
    path.join(cwd, "node_modules", "ffmpeg-static", "bin", exe),
    path.join(cwd, ".next", "standalone", "node_modules", "ffmpeg-static", exe),
    path.join(cwd, ".next", "standalone", "node_modules", "ffmpeg-static", "bin", exe),
    path.join("/var/task", "node_modules", "ffmpeg-static", exe),
    path.join("/var/task", "node_modules", "ffmpeg-static", "bin", exe),
    path.join("/var/task", ".next", "standalone", "node_modules", "ffmpeg-static", exe),
    path.join("/var/task", ".next", "standalone", "node_modules", "ffmpeg-static", "bin", exe),
  ];

  const found = firstExisting(candidates);
  if (!found) throw new Error(`FFMPEG not found. Tried:\n${candidates.join("\n")}`);
  return found;
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let out = "";
    let err = "";
    p.on("error", (e) => reject(new Error(`spawn ffmpeg failed: ${e.message}`)));
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${(err || out).slice(0, 9000)}`));
    });
  });
}

function isOfflineMode() {
  const devFlag = String(process.env.AI_NOTE_DEV_OFFLINE_MODE || "").trim();
  const testFlag = String(process.env.AI_NOTE_TEST_MODE || "").trim();
  const dev = process.env.NODE_ENV !== "production" && devFlag === "true";
  return dev || testFlag === "true";
}

async function getOfflineChunkFiles(noteId: string) {
  const dir = path.join(os.tmpdir(), "ai-note-offline", noteId, "chunks");
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const items = names
    .filter((n) => n.startsWith("chunk-") && n.endsWith(".webm"))
    .map((n) => {
      const m = n.match(/chunk-(\d+)\.webm$/);
      if (!m) return null;
      return { index: Number.parseInt(m[1], 10), name: n, path: path.join(dir, n) };
    })
    .filter(Boolean) as { index: number; name: string; path: string }[];
  items.sort((a, b) => a.index - b.index);
  return items;
}

function isRetryableStatus(code?: number) {
  return code === 429 || code === 502 || code === 503 || code === 504;
}

function isRetryableAsrMessage(msg: string) {
  const lower = msg.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("econnaborted") ||
    lower.includes("socket hang up") ||
    lower.includes("timeout") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("network error")
  );
}

function parseHttpStatus(msg: string): number | null {
  const m = msg.match(/HTTP error:\s*(\d{3})\b/i);
  if (m) return Number.parseInt(m[1], 10);
  const m2 = msg.match(/\b(\d{3})\b/);
  if (m2) return Number.parseInt(m2[1], 10);
  return null;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxTry = 4) {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxTry; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const status = parseHttpStatus(msg);
      const retryable = isRetryableStatus(status ?? undefined) || isRetryableAsrMessage(msg) || String(e?.code || "").toUpperCase().includes("TIMEOUT");
      if (!retryable || attempt === maxTry) break;
      const backoff = Math.min(30000, 500 * Math.pow(2, attempt - 1) + Math.round(Math.random() * 250));
      console.warn(`[ai-note/finalize] retry ${label} attempt=${attempt} backoff=${backoff}ms status=${status ?? "unknown"}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function setJobError(noteId: string, stage: string, progress: number, message: string) {
  await prisma.aiNoteJob.update({
    where: { noteId },
    data: { stage, progress, error: message },
  }).catch(() => {});
}

function buildSegmentFailureMessage(input: {
  noteId: string;
  segmentIndex: number;
  segmentsTotal: number;
  filename: string;
  cause: string;
}) {
  return JSON.stringify({
    code: "ASR_SEGMENT_FAILED",
    noteId: input.noteId,
    segmentIndex: input.segmentIndex,
    segmentNumber: input.segmentIndex + 1,
    segmentsTotal: input.segmentsTotal,
    filename: input.filename,
    cause: input.cause,
    retryable: true,
  });
}

async function transcribeWithFallback(
  buf: Buffer,
  fname: string,
  asrTimeoutMs: number
): Promise<string> {
  if (isOfflineMode()) {
    return `[offline transcript] ${fname}`;
  }

  // 1) External ASR (ASR_URL)
  try {
    return await withRetry(
      async () =>
        await withTimeout(
          transcribeAudioToText(new Blob([new Uint8Array(buf)], { type: "audio/wav" }) as any, {
            filename: fname,
            mime: "audio/wav",
          } as any),
          asrTimeoutMs,
          `asr_external_${fname}`
        ),
      `asr_external_${fname}`
    );
  } catch (e) {
    // 2) Groq fallback
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw e;
    const out = await withRetry(
      async () =>
        await withTimeout(
          callGroqTranscribe({
            apiKey: groqKey,
            audio: buf,
            mime: "audio/wav",
            filename: fname,
            model: process.env.AI_NOTE_ASR_MODEL || "whisper-large-v3",
          }),
          asrTimeoutMs,
          `asr_groq_${fname}`
        ),
      `asr_groq_${fname}`
    );
    return String(out?.text || "").trim();
  }
}

async function readBodyNoteId(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {}
  const noteId = String(body?.noteId || "").trim();
  return { noteId, body };
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function estimateSecondsByTranscript(transcript: string) {
  const w = countWords(transcript);
  return Math.max(1, Math.round(w / 2.5));
}

function firstMissingContiguousIndex(indexes: number[]) {
  const sorted = Array.from(new Set(indexes)).sort((a, b) => a - b);
  let expected = 0;
  for (const index of sorted) {
    if (index !== expected) break;
    expected += 1;
  }
  return expected;
}

// ✅ 安全分块：避免死循环
function chunkText(text: string, maxChars = 12000, overlap = 800) {
  const chunks: string[] = [];
  let i = 0;
  const safeOverlap = Math.max(0, Math.min(overlap, maxChars - 1));
  const n = text.length;

  while (i < n) {
    const end = Math.min(n, i + maxChars);
    chunks.push(text.slice(i, end));
    if (end >= n) break;

    const next = Math.max(0, end - safeOverlap);
    if (next <= i) i = end;
    else i = next;
  }

  return chunks;
}

function bytesToBuffer(data: any): Buffer {
  if (!data) throw new Error("chunk.data is empty");
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.from(data);
  if (data && typeof data === "object" && data.type === "Buffer" && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  if (typeof data === "string") {
    try {
      return Buffer.from(data, "base64");
    } catch {
      return Buffer.from(data, "utf8");
    }
  }
  throw new Error(`Unsupported bytes type: typeof=${typeof data} ctor=${data?.constructor?.name}`);
}

/** -----------------------------
 *  ✅ 并发锁（Lease Lock）
 *  - 防止同一个 noteId 同时被多个 finalize 请求处理
 *  - 用 updateMany 原子抢锁：锁为空或过期才允许抢
 * ----------------------------- */
function makeLockId() {
  return `${process.pid}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

async function acquireJobLock(noteId: string) {
  const now = new Date();
  const ttlMs = Math.max(10_000, parseEnvInt("AI_NOTE_LOCK_TTL_MS", 60_000));
  const expires = new Date(now.getTime() + ttlMs);
  const lockId = makeLockId();

  const r = await prisma.aiNoteJob.updateMany({
    where: {
      noteId,
      OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
    },
    data: {
      lockedAt: now,
      lockExpiresAt: expires,
      lockedBy: lockId,
    },
  });

  return { ok: r.count === 1, lockId, expires, ttlMs };
}

async function refreshJobLock(noteId: string, lockId: string) {
  const now = new Date();
  const ttlMs = Math.max(10_000, parseEnvInt("AI_NOTE_LOCK_TTL_MS", 60_000));
  const expires = new Date(now.getTime() + ttlMs);

  await prisma.aiNoteJob.updateMany({
    where: { noteId, lockedBy: lockId },
    data: { lockExpiresAt: expires },
  });
}

async function releaseJobLock(noteId: string, lockId: string) {
  await prisma.aiNoteJob.updateMany({
    where: { noteId, lockedBy: lockId },
    data: { lockedAt: null, lockExpiresAt: null, lockedBy: null },
  });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const { noteId } = await readBodyNoteId(req);

  try {
    const session = await getServerSession(authOptions);
    const userId = ((session as any)?.user?.id as string | undefined) ?? devBypassUserId();
    if (!userId) return bad("AUTH_REQUIRED", 401);

    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    // ownership check
    const sess = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });
    if (!sess) return bad("NOTE_NOT_FOUND", 404);
    if (sess.userId !== userId) return bad("FORBIDDEN", 403);

    // ensure job exists
    const job = await prisma.aiNoteJob.upsert({
      where: { noteId },
      update: {},
        create: {
          noteId,
          userId,
          stage: "prep",
          progress: 0,
          error: null,
          segmentTimeSec: Math.max(30, parseEnvInt("AI_NOTE_SEGMENT_TIME_SEC", 180)),
          segmentsTotal: 0,
          asrNextIndex: 0,
          llmNextPart: 0,
        llmPartsTotal: 0,
        noteMarkdown: null,
        secondsBilled: null,
      } as any,
    });

    // ✅ 抢锁（防并发）
    const lock = await acquireJobLock(noteId);
    if (!lock.ok) {
      return bad("LOCKED", 202, "Job is being processed by another request. Retry shortly.", {
        retryAfterMs: 1500,
      });
    }

    try {
      // ---------- STAGE: PREP ----------
      if (job.stage === "prep") {
        if (isOfflineMode()) {
          const files = await getOfflineChunkFiles(noteId);
          if (files.length === 0) return bad("NO_CHUNKS", 409, "No chunks uploaded.");
          for (let i = 0; i < files.length; i++) {
            if (files[i].index !== i) {
              return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Chunks not contiguous. Expect ${i}, got ${files[i].index}`);
            }
          }
        } else {
          const chunks = await prisma.aiNoteChunk.findMany({
            where: { noteId },
            orderBy: { chunkIndex: "asc" },
            select: { chunkIndex: true },
          });

          if (chunks.length === 0) return bad("NO_CHUNKS", 409, "No chunks uploaded.");

          for (let i = 0; i < chunks.length; i++) {
            if (chunks[i].chunkIndex !== i) {
              return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Chunks not contiguous. Expect ${i}, got ${chunks[i].chunkIndex}`);
            }
          }
        }

        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { stage: "asr", progress: 1, error: null, asrNextIndex: 0, llmNextPart: 0 },
        });

        return NextResponse.json({ ok: true, stage: "asr", progress: 1, noteId, elapsedMs: Date.now() - t0 });
      }

      // ---------- STAGE: ASR ----------
      if (job.stage === "asr") {
        await refreshJobLock(noteId, lock.lockId);

        if (isOfflineMode()) {
          const files = await getOfflineChunkFiles(noteId);
          if (files.length === 0) return bad("NO_CHUNKS", 409);

          await prisma.aiNoteJob.update({ where: { noteId }, data: { segmentsTotal: files.length } });

          for (const f of files) {
            await prisma.aiNoteTranscript.upsert({
              where: { noteId_chunkIndex: { noteId, chunkIndex: f.index } },
              update: { text: `[offline transcript] ${f.name}` },
              create: { noteId, chunkIndex: f.index, text: `[offline transcript] ${f.name}` },
            });
          }

          await prisma.aiNoteJob.update({
            where: { noteId },
            data: { stage: "llm", progress: 60, error: null, asrNextIndex: files.length },
          });

          return NextResponse.json({ ok: true, stage: "llm", progress: 60, noteId, segmentsTotal: files.length });
        }

        const ffmpegBin = getFfmpegBin();
        await ensureExecutable(ffmpegBin);

        const ASR_BATCH = Math.max(
          1,
          parseEnvInt("AI_NOTE_ASR_BATCH", parseEnvInt("AI_NOTE_ASR_CONCURRENCY", 1))
        );
        const asrTimeoutMs = Math.max(30_000, parseEnvInt("AI_NOTE_ASR_TIMEOUT_MS", 180_000));
        // Keep individual ASR requests bounded; larger slices were causing upstream resets/timeouts.
        const requestedSegTime = Math.max(30, job.segmentTimeSec || parseEnvInt("AI_NOTE_SEGMENT_TIME_SEC", 300));
        const segTime = Math.min(requestedSegTime, 180);

        const chunks = await prisma.aiNoteChunk.findMany({
          where: { noteId },
          orderBy: { chunkIndex: "asc" },
          select: { chunkIndex: true, data: true },
        });

        if (chunks.length === 0) return bad("NO_CHUNKS", 409);

        const workDir = path.join(os.tmpdir(), "ai-note", noteId, "work");
        await fs.mkdir(workDir, { recursive: true });

        const fullWebm = path.join(workDir, "full.webm");
        const fh = await fs.open(fullWebm, "w");
        try {
          for (const c of chunks) await fh.write(bytesToBuffer(c.data));
        } finally {
          await fh.close();
        }

        const fullWav = path.join(workDir, "full.wav");
        await withTimeout(
          run(ffmpegBin, ["-y", "-hide_banner", "-i", fullWebm, "-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", fullWav]),
          180_000,
          "ffmpeg_webm_to_wav"
        ).catch((e) => {
          throw Object.assign(new Error(String((e as any)?.message || e)), { _code: "FFMPEG_FAILED" });
        });

        const segPattern = path.join(workDir, "seg-%03d.wav");
        await withTimeout(
          run(ffmpegBin, ["-y", "-hide_banner", "-i", fullWav, "-f", "segment", "-segment_time", String(segTime), "-reset_timestamps", "1", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", segPattern]),
          180_000,
          "ffmpeg_segment"
        ).catch((e) => {
          throw Object.assign(new Error(String((e as any)?.message || e)), { _code: "FFMPEG_FAILED" });
        });

        const files = (await fs.readdir(workDir)).filter((n) => n.startsWith("seg-") && n.endsWith(".wav")).sort();
        const total = files.length;

        await prisma.aiNoteJob.update({ where: { noteId }, data: { segmentsTotal: total } });

        const existingTranscriptRows = await prisma.aiNoteTranscript.findMany({
          where: { noteId },
          select: { chunkIndex: true, text: true },
          orderBy: { chunkIndex: "asc" },
        });
        const completedTranscriptIndexes = existingTranscriptRows
          .filter((row) => String(row.text || "").trim().length > 0)
          .map((row) => row.chunkIndex);
        const resumeFromTranscript = Math.min(total, firstMissingContiguousIndex(completedTranscriptIndexes));
        const startIdx = resumeFromTranscript;
        const endIdx = Math.min(total, startIdx + ASR_BATCH);

        if (startIdx !== (job.asrNextIndex || 0)) {
          const syncedProgress = total > 0 ? Math.min(60, Math.max(1, Math.round((startIdx / total) * 60))) : 1;
          await prisma.aiNoteJob.update({
            where: { noteId },
            data: { asrNextIndex: startIdx, progress: syncedProgress, error: null },
          });
        }

        if (startIdx >= total) {
          await prisma.aiNoteJob.update({ where: { noteId }, data: { stage: "llm", progress: 60, error: null } });
          return NextResponse.json({ ok: true, stage: "llm", progress: 60, noteId, segmentsTotal: total });
        }

        const HasBlob = typeof (globalThis as any).Blob !== "undefined";
        if (!HasBlob) return bad("INTERNAL_ERROR", 500, "global Blob not available");

        for (let i = startIdx; i < endIdx; i++) {
          await refreshJobLock(noteId, lock.lockId);

          const fname = files[i];
          const p = path.join(workDir, fname);
          const buf = await fs.readFile(p);

          let text = "";
          try {
            text = await transcribeWithFallback(buf, fname, asrTimeoutMs);
          } catch (e: any) {
            const cause = String(e?.message || e);
            const errorMessage = buildSegmentFailureMessage({
              noteId,
              segmentIndex: i,
              segmentsTotal: total,
              filename: fname,
              cause,
            });
            await setJobError(noteId, "asr", job.progress || 1, errorMessage);
            throw Object.assign(new Error(errorMessage), { _code: "ASR_FAILED" });
          }

          const cleaned = String(text || "").trim();

          await prisma.aiNoteTranscript.upsert({
            where: { noteId_chunkIndex: { noteId, chunkIndex: i } },
            update: { text: cleaned },
            create: { noteId, chunkIndex: i, text: cleaned },
          });
        }

        const newNext = endIdx;
        const prog = total > 0 ? Math.min(60, Math.max(1, Math.round((newNext / total) * 60))) : 1;

        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { asrNextIndex: newNext, progress: prog, error: null },
        });

        return NextResponse.json({
          ok: true,
          stage: "asr",
          progress: prog,
          noteId,
          segmentsTotal: total,
          completedSegments: newNext,
          asrNextIndex: newNext,
          elapsedMs: Date.now() - t0,
        });
      }

      // ---------- STAGE: LLM ----------
      if (job.stage === "llm") {
        await refreshJobLock(noteId, lock.lockId);

        const rows = await prisma.aiNoteTranscript.findMany({
          where: { noteId },
          orderBy: { chunkIndex: "asc" },
          select: { text: true },
        });

        const transcriptAll = rows.map((r) => r.text || "").filter(Boolean).join("\n").trim();
        if (!transcriptAll) return bad("ASR_FAILED", 422, "Transcript is empty.");
        try {
          await assertNoteRequestAllowed(userId, transcriptAll.length, { allowStaged: true });
          markNoteAttempt(userId);
        } catch (error) {
          if (error instanceof NoteLimitError) {
            return NextResponse.json({ ok: false, error: error.code, message: error.message }, { status: error.status });
          }
          throw error;
        }

        if (isOfflineMode()) {
          const preview = transcriptAll.slice(0, 2000);
          const final = [
            "# Notes (offline/test)",
            "",
            "## TL;DR",
            "- Offline/test mode enabled. ASR/LLM network calls were bypassed.",
            "- Transcript is generated locally as placeholders.",
            "",
            "## Summary",
            `- Segments: ${rows.length}`,
            `- Transcript chars: ${transcriptAll.length}`,
            "",
            "## Transcript Preview (first 2000 chars)",
            "```",
            preview || "(empty)",
            "```",
          ].join("\n");

          await prisma.aiNoteJob.update({
            where: { noteId },
            data: {
              stage: "done",
              progress: 100,
              noteMarkdown: final,
              secondsBilled: 0,
              error: null,
            } as any,
          });

          await prisma.aiNoteChunk.deleteMany({ where: { noteId } }).catch(() => {});

          return NextResponse.json({
            ok: true,
            stage: "done",
            progress: 100,
            noteId,
            note: final,
            secondsBilled: 0,
            elapsedMs: Date.now() - t0,
          });
        }

        const seconds = estimateSecondsByTranscript(transcriptAll);
        try {
          await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
        } catch (e) {
          if (e instanceof QuotaError) {
            return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status ?? 429 });
          }
          throw e;
        }

        const llmTimeoutMs = Math.max(60_000, parseEnvInt("AI_NOTE_LLM_TIMEOUT_MS", 180_000));
        const LLM_BATCH = Math.max(1, parseEnvInt("AI_NOTE_LLM_BATCH", 1));

        // ✅ 你后面已经改成 6500/400 了就保持一致：也可以 env 化
        const maxChars = Math.max(2000, parseEnvInt("AI_NOTE_LLM_MAX_CHARS", 6500));
        const overlap = Math.max(0, parseEnvInt("AI_NOTE_LLM_OVERLAP", 400));
        const pauseMs = Math.max(0, parseEnvInt("AI_NOTE_LLM_PAUSE_MS", 15000));

        const chunks = chunkText(transcriptAll, maxChars, overlap);
        const totalParts = chunks.length;

        if ((job.llmPartsTotal || 0) !== totalParts) {
          await prisma.aiNoteJob.update({ where: { noteId }, data: { llmPartsTotal: totalParts } });
        }

        const existingSummaryParts = await prisma.aiNoteSummaryPart.findMany({
          where: { noteId },
          select: { partIndex: true, text: true },
          orderBy: { partIndex: "asc" },
        });
        const completedPartIndexes = existingSummaryParts
          .filter((row) => String(row.text || "").trim().length > 0)
          .map((row) => row.partIndex);
        const resumeFromPart = Math.min(totalParts, firstMissingContiguousIndex(completedPartIndexes));
        const startPart = resumeFromPart;
        const endPart = Math.min(totalParts, startPart + LLM_BATCH);

        if (startPart !== (job.llmNextPart || 0)) {
          const syncedProgress = totalParts > 0 ? 60 + Math.min(39, Math.round((startPart / totalParts) * 39)) : 80;
          await prisma.aiNoteJob.update({
            where: { noteId },
            data: { llmNextPart: startPart, progress: syncedProgress, error: null },
          });
        }

        if (startPart >= totalParts) {
          const parts = await prisma.aiNoteSummaryPart.findMany({
            where: { noteId },
            orderBy: { partIndex: "asc" },
            select: { text: true },
          });

          const merged = parts.map((p) => p.text || "").filter(Boolean).join("\n\n---\n\n");

          const final = await withTimeout(
            runAiNotePipeline(
              `下面是多段摘要，请合并去重、按主题重排，生成最终笔记（含目录、要点、行动项清单、风险/待确认）：\n${merged}`
            ),
            llmTimeoutMs,
            "llm_merge"
          ).catch((e) => {
            throw Object.assign(new Error(String((e as any)?.message || e)), { _code: "LLM_FAILED" });
          });

          await addUsageEvent(userId, "note_seconds", seconds).catch(() => {});
          await recordNoteGenerateSuccess(userId).catch(() => {});

          await prisma.aiNoteJob.update({
            where: { noteId },
            data: {
              stage: "done",
              progress: 100,
              noteMarkdown: String(final || ""),
              secondsBilled: seconds,
              error: null,
            } as any,
          });

          await prisma.aiNoteChunk.deleteMany({ where: { noteId } }).catch(() => {});

          return NextResponse.json({
            ok: true,
            stage: "done",
            progress: 100,
            noteId,
            note: String(final || ""),
            secondsBilled: seconds,
            elapsedMs: Date.now() - t0,
          });
        }

        for (let p = startPart; p < endPart; p++) {
          await refreshJobLock(noteId, lock.lockId);

          const text = chunks[p];
          const part = await withTimeout(
            runAiNotePipeline(
              `你是会议纪要助手。以下是第 ${p + 1}/${totalParts} 段转写，请输出：
              - 要点（bullet）
              - 决策
              - 行动项（含负责人/截止时间如有）
              - 问题与待确认事项
              正文：
${text}`
            ),
            llmTimeoutMs,
            `llm_part_${p}`
          ).catch((e) => {
            throw Object.assign(new Error(String((e as any)?.message || e)), { _code: "LLM_FAILED" });
          });

          await prisma.aiNoteSummaryPart.upsert({
            where: { noteId_partIndex: { noteId, partIndex: p } },
            update: { text: String(part || "") },
            create: { noteId, partIndex: p, text: String(part || "") },
          });

          if (pauseMs > 0) {
            await new Promise((r) => setTimeout(r, pauseMs));
          }
        }

        const newNext = endPart;
        const prog = totalParts > 0 ? 60 + Math.min(39, Math.round((newNext / totalParts) * 39)) : 80;

        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { llmNextPart: newNext, progress: prog, error: null },
        });

        return NextResponse.json({
          ok: true,
          stage: "llm",
          progress: prog,
          noteId,
          llmPartsTotal: totalParts,
          completedParts: newNext,
          llmNextPart: newNext,
          elapsedMs: Date.now() - t0,
        });
      }

      // ---------- DONE/FAILED ----------
      if (job.stage === "done") {
        return NextResponse.json({ ok: true, stage: "done", progress: 100, noteId, note: job.noteMarkdown ?? "" });
      }

      if (job.stage === "failed") {
        return NextResponse.json(
          { ok: false, stage: "failed", progress: job.progress, noteId, error: job.error ?? "FAILED" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, stage: job.stage, progress: job.progress, noteId });
    } finally {
      await releaseJobLock(noteId, lock.lockId).catch(() => {});
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error("[ai-note/finalize] error:", msg);

    if (e?._code === "FFMPEG_FAILED") return bad("FFMPEG_FAILED", 500, msg);
    if (e?._code === "ASR_FAILED") {
      let extra: Record<string, any> | undefined;
      let message = msg;
      try {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed === "object") {
          extra = parsed;
          message = `ASR failed on segment ${Number(parsed.segmentNumber || 0)}/${Number(parsed.segmentsTotal || 0)}. Retry to resume from the next unfinished segment.`;
        }
      } catch {}
      return bad("ASR_FAILED", 502, message, extra);
    }

    if (e?._code === "LLM_FAILED") {
      const m = msg.match(/try again in\s+([0-9.]+)s/i);
      if (msg.includes("429") && m) {
        const sec = Math.ceil(Number(m[1]) + 1);
        return bad("LLM_FAILED", 429, `LLM rate limited. Retry after ${sec}s.`, { retryAfterMs: sec * 1000 });
      }
      return bad("LLM_FAILED", 503, msg);
    }

    return bad("INTERNAL_ERROR", 500, msg);
  }
}
