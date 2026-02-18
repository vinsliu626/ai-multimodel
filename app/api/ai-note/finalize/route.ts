// app/api/ai-note/finalize/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import fssync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";

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
  const ttlMs = Math.max(10_000, Number.parseInt(process.env.AI_NOTE_LOCK_TTL_MS || "60000", 10) || 60_000);
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
  const ttlMs = Math.max(10_000, Number.parseInt(process.env.AI_NOTE_LOCK_TTL_MS || "60000", 10) || 60_000);
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
    const userId = (session as any)?.user?.id as string | undefined;
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
        segmentTimeSec: 90,
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

        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { stage: "asr", progress: 1, error: null, asrNextIndex: 0, llmNextPart: 0 },
        });

        return NextResponse.json({ ok: true, stage: "asr", progress: 1, noteId, elapsedMs: Date.now() - t0 });
      }

      // ---------- STAGE: ASR ----------
      if (job.stage === "asr") {
        await refreshJobLock(noteId, lock.lockId);

        const ffmpegBin = getFfmpegBin();
        await ensureExecutable(ffmpegBin);

        const ASR_BATCH = Math.max(1, parseInt(process.env.AI_NOTE_ASR_BATCH || "2", 10) || 2);
        const asrTimeoutMs = Math.max(30_000, parseInt(process.env.AI_NOTE_ASR_TIMEOUT_MS || "180000", 10) || 180_000);
        const segTime = Math.max(30, job.segmentTimeSec || 90);

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

        const startIdx = job.asrNextIndex || 0;
        const endIdx = Math.min(total, startIdx + ASR_BATCH);

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
          const blob = new Blob([new Uint8Array(buf)], { type: "audio/wav" });

          const text = await withTimeout(
            transcribeAudioToText(blob as any, { filename: fname, mime: "audio/wav" } as any),
            asrTimeoutMs,
            `asr_${fname}`
          ).catch((e) => {
            throw Object.assign(new Error(String((e as any)?.message || e)), { _code: "ASR_FAILED" });
          });

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

        const seconds = estimateSecondsByTranscript(transcriptAll);
        try {
          await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
        } catch (e) {
          if (e instanceof QuotaError) {
            return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status ?? 429 });
          }
          throw e;
        }

        const llmTimeoutMs = Math.max(60_000, parseInt(process.env.AI_NOTE_LLM_TIMEOUT_MS || "180000", 10) || 180_000);
        const LLM_BATCH = Math.max(1, parseInt(process.env.AI_NOTE_LLM_BATCH || "1", 10) || 1);

        // ✅ 你后面已经改成 6500/400 了就保持一致：也可以 env 化
        const maxChars = Math.max(2000, parseInt(process.env.AI_NOTE_LLM_MAX_CHARS || "6500", 10) || 6500);
        const overlap = Math.max(0, parseInt(process.env.AI_NOTE_LLM_OVERLAP || "400", 10) || 400);
        const pauseMs = Math.max(0, parseInt(process.env.AI_NOTE_LLM_PAUSE_MS || "15000", 10) || 15000);

        const chunks = chunkText(transcriptAll, maxChars, overlap);
        const totalParts = chunks.length;

        if ((job.llmPartsTotal || 0) !== totalParts) {
          await prisma.aiNoteJob.update({ where: { noteId }, data: { llmPartsTotal: totalParts } });
        }

        const startPart = job.llmNextPart || 0;
        const endPart = Math.min(totalParts, startPart + LLM_BATCH);

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
    if (e?._code === "ASR_FAILED") return bad("ASR_FAILED", 502, msg);

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