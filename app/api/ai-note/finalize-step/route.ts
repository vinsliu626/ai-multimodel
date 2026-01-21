// app/api/ai-note/finalize-step/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";
import { Buffer } from "node:buffer";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr =
  | "AUTH_REQUIRED"
  | "MISSING_NOTE_ID"
  | "NOTE_NOT_FOUND"
  | "FORBIDDEN"
  | "NO_CHUNKS"
  | "CHUNKS_NOT_CONTIGUOUS"
  | "ASR_FAILED"
  | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
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

function extFromMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  return "webm";
}

/**
 * ✅ 关键：把 Prisma Bytes（可能是 Buffer / Uint8Array / {type:'Buffer',data:[]} / Array<number>）
 * 统一转换成 Buffer，避免 Buffer.from(object) 变成 "[object Object]" 的垃圾数据。
 */
function bytesToBuffer(data: any): Buffer {
  if (!data) throw new Error("chunk.data is empty");

  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.from(data);

  // Prisma/JSON 化后：{ type:"Buffer", data:[...] }
  if (data && typeof data === "object" && data.type === "Buffer" && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }

  // 如果你曾经把 bytes encode 成 base64 字符串存进去
  if (typeof data === "string") {
    try {
      return Buffer.from(data, "base64");
    } catch {
      return Buffer.from(data, "utf8");
    }
  }

  throw new Error(`Unsupported bytes type for chunk.data: typeof=${typeof data} ctor=${data?.constructor?.name}`);
}


export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const body = await req.json().catch(() => ({}));
    const noteId = String(body?.noteId || "").trim();
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    const sess = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });
    if (!sess) return bad("NOTE_NOT_FOUND", 404);
    if (sess.userId !== userId) return bad("FORBIDDEN", 403);

    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, data: true },
    });
    if (chunks.length === 0) return bad("NO_CHUNKS", 400);

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Expect ${i}, got ${chunks[i].chunkIndex}`, {
          got: chunks.map((c) => c.chunkIndex),
        });
      }
    }

    const job = await prisma.aiNoteJob.upsert({
      where: { noteId },
      update: {},
      create: { noteId, userId, stage: "asr", progress: 0 },
      select: { stage: true, progress: true },
    });

    // ---------------- stage 1: ASR ----------------
    if (job.stage === "asr") {
      const done = await prisma.aiNoteTranscript.findMany({
        where: { noteId },
        select: { chunkIndex: true },
      });
      const doneSet = new Set(done.map((d) => d.chunkIndex));
      const pending = chunks.filter((c) => !doneSet.has(c.chunkIndex));

      const MAX_PER_CALL = 1; // 可改 2（但先别，避免超时）
      const batch = pending.slice(0, MAX_PER_CALL);

      for (const c of batch) {
  try {
    const mime = c.mime || "audio/webm";
    const ext = extFromMime(mime);
    const filename = `chunk-${String(c.chunkIndex).padStart(6, "0")}.${ext}`;

    const buf = bytesToBuffer(c.data);

    const headHex16 = buf.subarray(0, 16).toString("hex");
    console.log("CHUNK DEBUG", {
      chunkIndex: c.chunkIndex,
      mime,
      byteLen: buf.length,
      headHex: headHex16,
    });

    // ✅ 如果是 webm，但不是 EBML header 开头，说明它不是一个完整可解码的 webm 文件（多半是 MediaRecorder 分片）
    // EBML header: 1a45dfa3
    if (mime.includes("webm")) {
      const head4 = buf.subarray(0, 4).toString("hex");
      if (head4 !== "1a45dfa3") {
        throw new Error(
          `Chunk ${c.chunkIndex} is not a standalone WebM (missing EBML header). ` +
          `This happens with MediaRecorder timeslice chunks. ` +
          `Use server-side concat (your /finalize route) instead of per-chunk ASR. head=${head4}`
        );
      }
    }

    console.log("[ai-note/finalize-step] ASR start", {
      noteId,
      chunkIndex: c.chunkIndex,
      mime,
      bytes: buf.length,
      filename,
      asrUrl: process.env.ASR_URL ? "set" : "missing",
    });

    const text = await transcribeAudioToText(buf, {
      filename,
      mime,
      vad_filter: false, // ✅ 先关掉，避免 NO_SPEECH_DETECTED
      beam_size: 5,
    });

    console.log("[ai-note/finalize-step] ASR ok", {
      noteId,
      chunkIndex: c.chunkIndex,
      textChars: text.length,
    });

    await prisma.aiNoteTranscript.upsert({
      where: { noteId_chunkIndex: { noteId, chunkIndex: c.chunkIndex } },
      update: { text },
      create: { noteId, chunkIndex: c.chunkIndex, text },
    });
  } catch (e: any) {
  const msg = String(e?.message || e);
  if (msg.includes("NO_SPEECH_DETECTED")) {
    await prisma.aiNoteTranscript.upsert({
      where: { noteId_chunkIndex: { noteId, chunkIndex: c.chunkIndex } },
      update: { text: "" },
      create: { noteId, chunkIndex: c.chunkIndex, text: "" },
    });
    continue; // ✅ 跳过该 chunk，不失败
  }


    return bad("ASR_FAILED", 502, msg);
  }
}


      


      const afterCount = await prisma.aiNoteTranscript.count({ where: { noteId } });
      const progress = Math.floor((afterCount / chunks.length) * 70);

      if (afterCount >= chunks.length) {
        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { stage: "summarize", progress: 70, error: null },
        });
        return NextResponse.json({ ok: true, stage: "summarize", progress: 70, hint: "ASR done. Start summarizing." });
      }

      await prisma.aiNoteJob.update({ where: { noteId }, data: { progress, error: null } });
      return NextResponse.json({
        ok: true,
        stage: "asr",
        progress,
        asr: { done: afterCount, total: chunks.length, processedThisCall: batch.length },
      });
    }

    // ---------------- stage 2: summarize ----------------
    if (job.stage === "summarize") {
      const partsDone = await prisma.aiNoteSummaryPart.count({ where: { noteId } });

      const trs = await prisma.aiNoteTranscript.findMany({
        where: { noteId },
        orderBy: { chunkIndex: "asc" },
        select: { text: true },
      });

      const transcriptAll = trs.map((x) => x.text).join("\n").trim();
      const pieces = chunkText(transcriptAll, 12000, 800);

      const MAX_PER_CALL = 1;
      const startIdx = partsDone;
      const batch = pieces.slice(startIdx, startIdx + MAX_PER_CALL);

      for (let i = 0; i < batch.length; i++) {
        const partIndex = startIdx + i;
        const c = batch[i];

        const part = await runAiNotePipeline(
          `你是会议纪要助手。以下是第 ${partIndex + 1}/${pieces.length} 段转写，请输出：
- 要点（bullet）
- 决策
- 行动项（含负责人/截止时间如有）
- 问题与待确认事项
正文：
${c}`
        );

        await prisma.aiNoteSummaryPart.upsert({
          where: { noteId_partIndex: { noteId, partIndex } },
          update: { text: part },
          create: { noteId, partIndex, text: part },
        });
      }

      const after = await prisma.aiNoteSummaryPart.count({ where: { noteId } });
      const progress = 70 + Math.floor((after / pieces.length) * 25);

      if (after >= pieces.length) {
        await prisma.aiNoteJob.update({
          where: { noteId },
          data: { stage: "merge", progress: 95, error: null },
        });
        return NextResponse.json({ ok: true, stage: "merge", progress: 95, hint: "Parts summarized. Start merging." });
      }

      await prisma.aiNoteJob.update({ where: { noteId }, data: { progress, error: null } });
      return NextResponse.json({
        ok: true,
        stage: "summarize",
        progress,
        summarize: { done: after, total: pieces.length, processedThisCall: batch.length },
      });
    }

    // ---------------- stage 3: merge ----------------
    if (job.stage === "merge") {
      const parts = await prisma.aiNoteSummaryPart.findMany({
        where: { noteId },
        orderBy: { partIndex: "asc" },
        select: { text: true },
      });

      const merged = parts.map((p) => p.text).join("\n\n---\n\n");
      const note = await runAiNotePipeline(
        `下面是多段摘要，请合并去重、按主题重排，生成最终笔记（含目录、要点、行动项清单、风险/待确认）：
${merged}`
      );

      await prisma.aiNoteJob.update({
        where: { noteId },
        data: { stage: "done", progress: 100, error: null },
      });

      return NextResponse.json({ ok: true, stage: "done", progress: 100, note });
    }

    if (job.stage === "done") {
      return NextResponse.json({ ok: true, stage: "done", progress: 100 });
    }

    // failed: return job error for debugging
  const failedJob = await prisma.aiNoteJob.findUnique({
    where: { noteId },
    select: { progress: true, error: true, stage: true },
  });

  return NextResponse.json({
    ok: false,
    stage: failedJob?.stage ?? "failed",
    progress: failedJob?.progress ?? job.progress,
    error: failedJob?.error ?? null,
  });

  } catch (e: any) {
    console.error("[ai-note/finalize-step] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
