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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr =
  | "AUTH_REQUIRED"
  | "MISSING_NOTE_ID"
  | "NOTE_NOT_FOUND"
  | "FORBIDDEN"
  | "NO_CHUNKS"
  | "CHUNKS_NOT_CONTIGUOUS"
  | "FFMPEG_FAILED"
  | "ASR_FAILED"
  | "INTERNAL_ERROR"
  | "FILE_NOT_SUPPORTED_IN_NODE";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
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

// ffmpeg concat list escaping
function escForFfmpegConcat(p: string) {
  return p.replace(/'/g, `'\\''`);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const { noteId } = await readBodyAndNoteId(req);
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

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

    if (chunks.length === 0) {
      return bad("NO_CHUNKS", 400, "No chunks uploaded.", { noteId });
    }

    // 连续性校验
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad(
          "CHUNKS_NOT_CONTIGUOUS",
          400,
          `Chunks not contiguous. Expect ${i}, got ${chunks[i].chunkIndex}`,
          { got: chunks.map((c) => c.chunkIndex) }
        );
      }
    }

    // ✅ 单请求工作目录：/tmp (os.tmpdir()) 是可写的
    const workDir = path.join(os.tmpdir(), "ai-note", noteId, "work");
    await fs.mkdir(workDir, { recursive: true });

    // 把 DB chunks 写到临时文件（ffmpeg 需要文件路径）
    const chunkDir = path.join(workDir, "chunks");
    await fs.mkdir(chunkDir, { recursive: true });

    const chunkPaths: string[] = [];
    for (const c of chunks) {
      // 不同 mime 可能是 webm/ogg/mp4 等，这里统一扩展名先用 webm 兜底
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

    // concat list
    const listPath = path.join(workDir, "concat.txt");
    const lines = chunkPaths.map((p) => `file '${escForFfmpegConcat(p)}'`).join("\n");
    await fs.writeFile(listPath, lines, "utf-8");

    // concat -> full.wav (mono/16k)
    const fullWav = path.join(workDir, "full.wav");
    try {
      await run("ffmpeg", [
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
      ]);
    } catch (e: any) {
      return bad("FFMPEG_FAILED", 500, e?.message || "ffmpeg concat failed");
    }

    // segment 10min
    const segPattern = path.join(workDir, "seg-%03d.wav");
    try {
      await run("ffmpeg", [
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
      ]);
    } catch (e: any) {
      return bad("FFMPEG_FAILED", 500, e?.message || "ffmpeg segment failed");
    }

    const files = (await fs.readdir(workDir))
      .filter((n) => n.startsWith("seg-") && n.endsWith(".wav"))
      .sort();

    let transcriptAll = "";

    const HasFile = typeof (globalThis as any).File !== "undefined";
    const HasBlob = typeof (globalThis as any).Blob !== "undefined";
    if (!HasFile || !HasBlob) {
      return bad("FILE_NOT_SUPPORTED_IN_NODE", 500, "global File/Blob is not available in this Node runtime.");
    }

    for (const fname of files) {
      const p = path.join(workDir, fname);
      const buf = await fs.readFile(p);

      const blob = new Blob([buf], { type: "audio/wav" });
      const f = new File([blob], fname, { type: "audio/wav" });

      try {
        const t = await transcribeAudioToText(f);
        const clean = String(t || "").trim();
        if (clean) transcriptAll += (transcriptAll ? "\n" : "") + clean;
      } catch (e: any) {
        return bad("ASR_FAILED", 502, e?.message || "ASR failed");
      }
    }

    if (!transcriptAll.trim()) return bad("ASR_FAILED", 502, "ASR returned empty transcript");

    const note =
      transcriptAll.length > 30_000
        ? await runAiNotePipelineChunked(transcriptAll)
        : await runAiNotePipeline(transcriptAll);

    const seconds = estimateSecondsByTranscript(transcriptAll);

    // ✅ 清理 DB：session + chunks
    await prisma.aiNoteChunk.deleteMany({ where: { noteId } });
    await prisma.aiNoteSession.delete({ where: { id: noteId } });

    return NextResponse.json({
      ok: true,
      note,
      secondsBilled: seconds,
      transcriptChars: transcriptAll.length,
      segments: files.length,
      chunks: chunks.length,
    });
  } catch (e: any) {
    console.error("[ai-note/finalize] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
