// app/api/ai-note/finalize/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { getNote, deleteNote } from "@/lib/aiNote/noteStore";
import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";

// 你已有的 chunked 总结逻辑（保留）
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

/**
 * ✅ B-1：finalize 支持多路拿 noteId
 * 优先级：JSON body.noteId → query ?noteId= → header x-note-id
 *
 * 注意：Request body 只能读一次，所以这里读完 body 就直接 return { noteId, body }
 */
async function readBodyAndNoteId(req: Request): Promise<{ noteId: string; body: any }> {
  let body: any = null;

  // 1) JSON body
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const fromBody = String(body?.noteId || "").trim();
  if (fromBody) return { noteId: fromBody, body };

  // 2) query
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("noteId") || "").trim();
    if (q) return { noteId: q, body };
  } catch {
    // ignore
  }

  // 3) header
  const h = String(req.headers.get("x-note-id") || "").trim();
  if (h) return { noteId: h, body };

  return { noteId: "", body };
}

// concat.txt 的单引号转义
function escForFfmpegConcat(p: string) {
  // ffmpeg concat 文件格式：file 'path'
  // 单引号要写成 '\'' 这种（等价于：结束字符串 + 转义单引号 + 继续字符串）
  return p.replace(/'/g, `'\\''`);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const { noteId } = await readBodyAndNoteId(req);
    if (!noteId) {
      console.log("[ai-note/finalize] MISSING_NOTE_ID", {
        url: req.url,
        xNoteId: req.headers.get("x-note-id"),
      });
      return bad("MISSING_NOTE_ID", 400);
    }

    console.log("[ai-note/finalize] noteId=", noteId, "pid=", process.pid);

    const meta = await getNote(noteId);

    // ✅ 关键 debug：你现在 NO_CHUNKS，就必须先确认 meta 到底是什么
    console.log("[ai-note/finalize] meta exists=", !!meta, "userId=", meta?.userId, "chunks=", meta?.chunks?.length);

    if (!meta) return bad("NOTE_NOT_FOUND", 404);
    if (meta.userId !== userId) return bad("FORBIDDEN", 403);

    const chunks = (meta.chunks || []).slice().sort((a, b) => a.chunkIndex - b.chunkIndex);

    // ✅ 如果 NO_CHUNKS：把 meta 文件信息打出来（方便你立刻定位 chunk 根本没写进去）
    if (chunks.length === 0) {
      console.log("[ai-note/finalize] NO_CHUNKS meta=", meta);
      return bad("NO_CHUNKS", 400, "No chunks uploaded.", {
        noteId,
        chunks: 0,
        hint:
          "meta.chunks is empty. This means /api/ai-note/chunk did NOT call noteStore.addChunk() successfully (or wrote to a different tmp dir).",
      });
    }

    // ✅ 强烈建议：校验 chunkIndex 连续（避免丢分片）
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Chunks not contiguous. Expect ${i}, got ${chunks[i].chunkIndex}`, {
          got: chunks.map((c) => c.chunkIndex),
        });
      }
    }

    // 工作目录
    const noteDir = path.dirname(chunks[0].filePath);
    const workDir = path.join(noteDir, "_work");
    await fs.mkdir(workDir, { recursive: true });

    // 1) concat list
    const listPath = path.join(workDir, "concat.txt");
    const lines = chunks.map((c) => `file '${escForFfmpegConcat(String(c.filePath))}'`).join("\n");
    await fs.writeFile(listPath, lines, "utf-8");

    // 2) concat → full.wav（统一 wav/16k/mono，显式禁用视频/字幕轨更稳）
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

    // 3) 切段：每 600 秒（10 分钟）一个 wav
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

    // 4) 逐段 ASR
    const files = (await fs.readdir(workDir))
      .filter((n) => n.startsWith("seg-") && n.endsWith(".wav"))
      .sort();

    // ✅ 这也打出来，确认 segment 确实生成了
    console.log("[ai-note/finalize] segments =", files.length, files.slice(0, 3));

    let transcriptAll = "";

    // Node 里 File/Blob 是否存在（Node 18+ 通常 OK）
    const HasFile = typeof (globalThis as any).File !== "undefined";
    const HasBlob = typeof (globalThis as any).Blob !== "undefined";

    if (!HasFile || !HasBlob) {
      // 你现在 runtime=nodejs，如果这里报错说明你 Node 太老（或环境不带 File）
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

    // 5) 跑笔记 pipeline（超长走 chunked）
    const note =
      transcriptAll.length > 30_000
        ? await runAiNotePipelineChunked(transcriptAll)
        : await runAiNotePipeline(transcriptAll);

    const seconds = estimateSecondsByTranscript(transcriptAll);

    // 6) 清理 meta（按你策略：这里只删 meta）
    await deleteNote(noteId);

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
