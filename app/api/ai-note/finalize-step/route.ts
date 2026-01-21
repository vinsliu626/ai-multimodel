// app/api/ai-note/finalize-step/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";

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

/**
 * ✅ 不用 undici：我们给 transcribeAudioToText 一个“File-like”对象
 * 只要它内部用到的是 arrayBuffer()/type/name 这种能力，就能跑。
 */
function makeFileLike(buf: Buffer, name: string, type: string) {
  return {
    name,
    type,
    size: buf.length,
    async arrayBuffer() {
      // Buffer -> ArrayBuffer
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return ab as ArrayBuffer;
    },
  } as any;
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

    // --- load chunks ---
    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, data: true },
    });
    if (chunks.length === 0) return bad("NO_CHUNKS", 400);

    // contiguous check
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkIndex !== i) {
        return bad("CHUNKS_NOT_CONTIGUOUS", 400, `Expect ${i}, got ${chunks[i].chunkIndex}`, {
          got: chunks.map((c) => c.chunkIndex),
        });
      }
    }

    // --- job state ---
    const job = await prisma.aiNoteJob.upsert({
      where: { noteId },
      update: {},
      create: { noteId, userId, stage: "asr", progress: 0 },
      select: { stage: true, progress: true },
    });

    // --- stage 1: ASR ---
    if (job.stage === "asr") {
      const done = await prisma.aiNoteTranscript.findMany({
        where: { noteId },
        select: { chunkIndex: true },
      });
      const doneSet = new Set(done.map((d) => d.chunkIndex));
      const pending = chunks.filter((c) => !doneSet.has(c.chunkIndex));

      const MAX_PER_CALL = 1;
      const batch = pending.slice(0, MAX_PER_CALL);

      for (const c of batch) {
        try {
          const buf = Buffer.from(c.data);
          const mime = c.mime || "audio/webm";
          const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm";
          const fileLike = makeFileLike(buf, `chunk-${String(c.chunkIndex).padStart(6, "0")}.${ext}`, mime);

          const t = await transcribeAudioToText(fileLike);
          const text = String(t || "").trim();

          await prisma.aiNoteTranscript.upsert({
            where: { noteId_chunkIndex: { noteId, chunkIndex: c.chunkIndex } },
            update: { text },
            create: { noteId, chunkIndex: c.chunkIndex, text },
          });
        } catch (e: any) {
          console.error("[ai-note/finalize-step] ASR failed:", e);
          await prisma.aiNoteJob.update({
            where: { noteId },
            data: { stage: "failed", error: e?.message || "ASR_FAILED" },
          });
          return bad("ASR_FAILED", 502, e?.message || "ASR failed");
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

    // --- stage 2: summarize ---
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

    // --- stage 3: merge ---
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

    return NextResponse.json({ ok: false, stage: "failed", progress: job.progress });
  } catch (e: any) {
    console.error("[ai-note/finalize-step] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
