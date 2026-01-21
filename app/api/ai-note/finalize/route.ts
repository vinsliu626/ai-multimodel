import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ 关键：延长 Vercel 函数最大执行时长（上限受套餐影响）
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

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${(err || out).slice(0, 6000)}`));
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

function escForFfmpegConcat(p: string) {
  return p.replace(/'/g, `'\\''`);
}

// ---- your existing helpers (kept) ----
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

// ✅ 小并发池
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

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const { noteId } = await readBodyAndNoteId(req);
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    console.log("[ai-note/finalize] start noteId=", noteId);

    const sessRow = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });
    if (!sessRow) return bad("NOTE_NOT_FOUND", 404);
    if (sessRow.userId !== userId) return bad("FORBIDDEN", 403);

    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, size: true, data: true },
    });

    if (chunks.length === 0) return bad("NO_CHUNKS", 400, "No chunks uploaded.", { noteId });

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Chunks not contiguous. Expect ${i}, got ${chunks[i].chunkIndex}`, {
          got: chunks.map((c) => c.chunkIndex),
        });
      }
    }

    const workDir = path.join(os.tmpdir(), "ai-note", noteId, "work");
    await fs.mkdir(workDir, { recursive: true });

    const chunkDir = path.join(workDir, "chunks");
    await fs.mkdir(chunkDir, { recursive: true });

    console.log("[ai-note/finalize] chunks=", chunks.length, "tmpDir=", workDir);

    const chunkPaths: string[] = [];
    for (const c of chunks) {
      const ext =
        (c.mime || "").includes("ogg")
          ? "ogg"
          : (c.mime || "").includes("wav")
          ? "wav"
          : (c.mime || "").includes("mpeg")
          ? "mp3"
          : (c.mime || "").includes("mp4")
          ? "mp4"
          : "webm";

      const p = path.join(chunkDir, `chunk-${String(c.chunkIndex).padStart(6, "0")}.${ext}`);
      await fs.writeFile(p, Buffer.from(c.data));
      chunkPaths.push(p);
    }

    const listPath = path.join(workDir, "concat.txt");
    const lines = chunkPaths.map((p) => `file '${escForFfmpegConcat(p)}'`).join("\n");
    await fs.writeFile(listPath, lines, "utf-8");

    const fullWav = path.join(workDir, "full.wav");
    console.log("[ai-note/finalize] ffmpeg concat...");
    await withTimeout(
      run("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        "16000",
        fullWav,
      ]),
      120_000,
      "ffmpeg_concat"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "FFMPEG_FAILED" });
    });

    // segment 10min
    const segPattern = path.join(workDir, "seg-%03d.wav");
    console.log("[ai-note/finalize] ffmpeg segment...");
    await withTimeout(
      run("ffmpeg", [
        "-y",
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
        segPattern,
      ]),
      120_000,
      "ffmpeg_segment"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "FFMPEG_FAILED" });
    });

    const files = (await fs.readdir(workDir)).filter((n) => n.startsWith("seg-") && n.endsWith(".wav")).sort();
    console.log("[ai-note/finalize] segments=", files.length, "elapsed(ms)=", Date.now() - t0);

    const HasFile = typeof (globalThis as any).File !== "undefined";
    const HasBlob = typeof (globalThis as any).Blob !== "undefined";
    if (!HasFile || !HasBlob) return bad("FILE_NOT_SUPPORTED_IN_NODE", 500, "global File/Blob not available.");

    // ✅ 并发 ASR（默认 2；可用 env 调整）
    const asrConcurrency = Math.max(1, Number.parseInt(process.env.AI_NOTE_ASR_CONCURRENCY || "2", 10) || 2);
    const asrTimeoutMs = Math.max(10_000, Number.parseInt(process.env.AI_NOTE_ASR_TIMEOUT_MS || "60000", 10) || 60_000);

    console.log("[ai-note/finalize] ASR concurrency=", asrConcurrency, "timeoutMs=", asrTimeoutMs);

    const texts = await mapPool(files, asrConcurrency, async (fname) => {
      const p = path.join(workDir, fname);
      const buf = await fs.readFile(p);
      const blob = new Blob([buf], { type: "audio/wav" });
      const f = new File([blob], fname, { type: "audio/wav" });

      const t = await withTimeout(Promise.resolve(transcribeAudioToText(f)), asrTimeoutMs, `asr_${fname}`);
      return String(t || "").trim();
    }).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "ASR_FAILED" });
    });

    const transcriptAll = texts.filter(Boolean).join("\n").trim();
    if (!transcriptAll) return bad("ASR_FAILED", 502, "ASR returned empty transcript");

    console.log("[ai-note/finalize] transcript chars=", transcriptAll.length, "elapsed(ms)=", Date.now() - t0);

    // ✅ LLM pipeline 也加超时
    const llmTimeoutMs = Math.max(30_000, Number.parseInt(process.env.AI_NOTE_LLM_TIMEOUT_MS || "120000", 10) || 120_000);

    const note = await withTimeout(
      transcriptAll.length > 30_000 ? runAiNotePipelineChunked(transcriptAll) : runAiNotePipeline(transcriptAll),
      llmTimeoutMs,
      "llm_pipeline"
    ).catch((e: any) => {
      throw Object.assign(new Error(e?.message || String(e)), { _code: "LLM_FAILED" });
    });

    const seconds = estimateSecondsByTranscript(transcriptAll);

    await prisma.aiNoteChunk.deleteMany({ where: { noteId } });
    await prisma.aiNoteSession.delete({ where: { id: noteId } });

    console.log("[ai-note/finalize] done elapsed(ms)=", Date.now() - t0);

    return NextResponse.json({
      ok: true,
      note,
      secondsBilled: seconds,
      transcriptChars: transcriptAll.length,
      segments: files.length,
      chunks: chunks.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[ai-note/finalize] error:", msg);

    if (String(msg).startsWith("TIMEOUT:")) {
      return bad("TIMEOUT", 504, msg);
    }
    if (e?._code === "FFMPEG_FAILED") return bad("FFMPEG_FAILED", 500, msg);
    if (e?._code === "ASR_FAILED") return bad("ASR_FAILED", 502, msg);
    if (e?._code === "LLM_FAILED") return bad("LLM_FAILED", 502, msg);

    return bad("INTERNAL_ERROR", 500, msg);
  }
}
