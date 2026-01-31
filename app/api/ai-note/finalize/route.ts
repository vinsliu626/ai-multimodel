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

// ✅ NEW
import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  | "FILE_NOT_SUPPORTED_IN_NODE"
  | "TIMEOUT";

function dbHead() {
  return String(process.env.DATABASE_URL || "").slice(0, 30);
}

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      message: message ?? code,
      stage: "failed",
      progress: 0,
      ...(extra ? { extra } : {}),
    },
    { status }
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT:${label}:${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
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
    path.join(cwd, ".vercel", "output", "functions", "api", "node_modules", "ffmpeg-static", exe),
    path.join(cwd, ".vercel", "output", "functions", "api", "node_modules", "ffmpeg-static", "bin", exe),
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
    if (!cmd) return reject(new Error("ffmpeg cmd is empty"));
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });

    let out = "";
    let err = "";

    p.on("error", (e) => reject(new Error(`spawn ffmpeg failed: ${e.message}`)));
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const body = (err || out).slice(0, 9000);
        reject(new Error(`ffmpeg failed (${code}): ${body}`));
      }
    });
  });
}

async function readBodyAndNoteId(req: Request): Promise<{ noteId: string; body: any }> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const fromBody = String(body?.noteId || "").trim();
  if (fromBody) return { noteId: fromBody, body };

  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("noteId") || "").trim();
    if (q) return { noteId: q, body };
  } catch {}

  const h = String(req.headers.get("x-note-id") || "").trim();
  if (h) return { noteId: h, body };

  return { noteId: "", body };
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function estimateSecondsByTranscript(transcript: string) {
  const w = countWords(transcript);
  return Math.max(1, Math.round(w / 2.5));
}

function chunkText(text: string, maxChars = 12000, overlap = 800) {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    chunks.push(text.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

async function runAiNotePipelineChunked(transcript: string) {
  const chunks = chunkText(transcript);
  const partials: string[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const c = chunks[idx];
    const part = await runAiNotePipeline(
      `你是会议纪要助手。以下是第 ${idx + 1}/${chunks.length} 段转写，请输出：
- 要点（bullet）
- 决策
- 行动项（含负责人/截止时间如有）
- 问题与待确认事项
正文：
${c}`
    );
    partials.push(part);
  }
  const merged = partials.join("\n\n---\n\n");
  const final = await runAiNotePipeline(
    `下面是多段摘要，请合并去重、按主题重排，生成最终笔记（含目录、要点、行动项清单、风险/待确认）：
${merged}`
  );
  return final;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (x: T, idx: number) => Promise<R>) {
  const res: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      res[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return res;
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

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    console.log("[ai-note/finalize] dbHead=", dbHead());

    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const { noteId } = await readBodyAndNoteId(req);
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    const ffmpegBin = getFfmpegBin();
    await ensureExecutable(ffmpegBin);

    console.log("[ai-note/finalize] start noteId=", noteId);
    console.log("[ai-note/finalize] ffmpeg=", ffmpegBin);

    const sessExists = await prisma.aiNoteSession.count({ where: { id: noteId } });
    const chunksCount0 = await prisma.aiNoteChunk.count({ where: { noteId } });

    if (sessExists === 0 && chunksCount0 === 0) {
      return bad("NOTE_NOT_FOUND", 404, "NOTE_NOT_FOUND (no session & no chunks)", {
        noteId,
        userId,
        dbHead: dbHead(),
        sessExists,
        chunksCount: chunksCount0,
      });
    }

    let sessRow = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (!sessRow) {
      try {
        await prisma.aiNoteSession.create({
          data: { id: noteId, userId } as any,
        });
      } catch {}

      sessRow = await prisma.aiNoteSession.findUnique({
        where: { id: noteId },
        select: { userId: true },
      });

      if (!sessRow) {
        const chunksCount = await prisma.aiNoteChunk.count({ where: { noteId } });
        return bad("NOTE_NOT_FOUND", 404, "NOTE_NOT_FOUND (chunks exist but session still missing)", {
          noteId,
          userId,
          dbHead: dbHead(),
          chunksCount,
        });
      }
    }

    if (sessRow.userId !== userId) return bad("FORBIDDEN", 403, "FORBIDDEN", { noteId });

    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, data: true },
    });

    if (chunks.length === 0) {
      return bad("NO_CHUNKS", 409, "No chunks. This note may have already been finalized/cleaned.", {
        noteId,
        dbHead: dbHead(),
      });
    }

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Chunks not contiguous. Expect ${i}, got ${chunks[i].chunkIndex}`, {
          noteId,
          got: chunks.map((c) => c.chunkIndex),
        });
      }
    }

    const workDir = path.join(os.tmpdir(), "ai-note", noteId, "work");
    await fs.mkdir(workDir, { recursive: true });

    const fullWebm = path.join(workDir, "full.webm");
    const fh = await fs.open(fullWebm, "w");
    try {
      for (const c of chunks) {
        const buf = bytesToBuffer(c.data);
        await fh.write(buf);
      }
    } finally {
      await fh.close();
    }

    const fullWav = path.join(workDir, "full.wav");
    console.log("[ai-note/finalize] ffmpeg webm->wav...");
    await withTimeout(
      run(ffmpegBin, ["-y", "-hide_banner", "-i", fullWebm, "-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", fullWav]),
      120_000,
      "ffmpeg_webm_to_wav"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "FFMPEG_FAILED" });
    });

    const segPattern = path.join(workDir, "seg-%03d.wav");
    console.log("[ai-note/finalize] ffmpeg segment...");
    await withTimeout(
      run(ffmpegBin, [
        "-y",
        "-hide_banner",
        "-i",
        fullWav,
        "-vn",
        "-sn",
        "-dn",
        "-f",
        "segment",
        "-segment_time",
        "600",
        "-reset_timestamps",
        "1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        segPattern,
      ]),
      120_000,
      "ffmpeg_segment"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "FFMPEG_FAILED" });
    });

    const files = (await fs.readdir(workDir)).filter((n) => n.startsWith("seg-") && n.endsWith(".wav")).sort();
    console.log("[ai-note/finalize] segments=", files.length, "elapsed(ms)=", Date.now() - t0);

    const HasBlob = typeof (globalThis as any).Blob !== "undefined";
    if (!HasBlob) return bad("FILE_NOT_SUPPORTED_IN_NODE", 500, "global Blob not available.");

    const asrConcurrency = Math.max(1, Number.parseInt(process.env.AI_NOTE_ASR_CONCURRENCY || "2", 10) || 2);
    const asrTimeoutMs = Math.max(10_000, Number.parseInt(process.env.AI_NOTE_ASR_TIMEOUT_MS || "60000", 10) || 60_000);

    console.log("[ai-note/finalize] ASR concurrency=", asrConcurrency, "timeoutMs=", asrTimeoutMs);

    const texts = await mapPool(files, asrConcurrency, async (fname) => {
      const p = path.join(workDir, fname);
      const buf = await fs.readFile(p);
      const blob = new Blob([new Uint8Array(buf)], { type: "audio/wav" });

      try {
        const t = await withTimeout(
          transcribeAudioToText(blob, { filename: fname, mime: "audio/wav" } as any),
          asrTimeoutMs,
          `asr_${fname}`
        );
        return String(t || "").trim();
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes("NO_SPEECH_DETECTED") || msg.includes("EMPTY_TRANSCRIPT") || msg.includes("AUDIO_TOO_SHORT_OR_EMPTY")) {
          console.warn("[ai-note/finalize] segment no speech -> skip", { fname, msg });
          return "";
        }
        throw e;
      }
    }).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "ASR_FAILED" });
    });

    const transcriptAll = texts.filter(Boolean).join("\n").trim();
    if (!transcriptAll) return bad("ASR_FAILED", 422, "NO_SPEECH_DETECTED: transcript is empty");

    console.log("[ai-note/finalize] transcript chars=", transcriptAll.length, "elapsed(ms)=", Date.now() - t0);

    // ✅ 这里开始：接入 guard(note) + 先扣额度判定（避免白跑 LLM）
    const seconds = estimateSecondsByTranscript(transcriptAll);

    try {
      await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
    } catch (e) {
      if (e instanceof QuotaError) {
        return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status ?? 429 });
      }
      throw e;
    }
    // ✅ 接入结束

    const llmTimeoutMs = Math.max(30_000, Number.parseInt(process.env.AI_NOTE_LLM_TIMEOUT_MS || "120000", 10) || 120_000);

    const note = await withTimeout(
      transcriptAll.length > 30_000 ? runAiNotePipelineChunked(transcriptAll) : runAiNotePipeline(transcriptAll),
      llmTimeoutMs,
      "llm_pipeline"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "LLM_FAILED" });
    });

    // ✅ 成功才写 usage
    await addUsageEvent(userId, "note_seconds", seconds).catch((err) =>
      console.error("[note] usageEvent write failed:", err)
    );

    // ✅ 只删 chunks，不删 session
    await prisma.aiNoteChunk.deleteMany({ where: { noteId } });

    console.log("[ai-note/finalize] done elapsed(ms)=", Date.now() - t0);

    return NextResponse.json({
      ok: true,
      stage: "done",
      progress: 100,
      note,
      secondsBilled: seconds,
      transcriptChars: transcriptAll.length,
      segments: files.length,
      chunks: chunks.length,
      elapsedMs: Date.now() - t0,
      dbHead: dbHead(),
      noteId,
      userId,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error("[ai-note/finalize] error:", msg);

    if (String(msg).startsWith("TIMEOUT:")) return bad("TIMEOUT", 504, msg, { dbHead: dbHead() });
    if (e?._code === "FFMPEG_FAILED") return bad("FFMPEG_FAILED", 500, msg, { dbHead: dbHead() });
    if (e?._code === "ASR_FAILED") return bad("ASR_FAILED", 502, msg, { dbHead: dbHead() });

    if (e?._code === "LLM_FAILED") {
      const short = msg.slice(0, 900);
      return bad("LLM_FAILED", 503, `LLM temporary unavailable (HF). Retry later. details: ${short}`, { dbHead: dbHead() });
    }

    return bad("INTERNAL_ERROR", 500, msg, { dbHead: dbHead() });
  }
}