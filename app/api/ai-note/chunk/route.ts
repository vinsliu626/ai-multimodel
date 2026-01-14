// app/api/ai-note/chunk/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";

import { getNote, addChunk, getNoteRootDir } from "@/lib/aiNote/noteStore";
import { transcribeAudioToText } from "@/lib/asr/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErrCode =
  | "AUTH_REQUIRED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "MISSING_NOTE_ID"
  | "MISSING_CHUNK_INDEX"
  | "INVALID_CHUNK_INDEX"
  | "MISSING_FILE"
  | "NOTE_NOT_FOUND"
  | "FORBIDDEN"
  | "CHUNK_TOO_LARGE"
  | "SAVE_FAILED"
  | "ASR_FAILED"
  | "INTERNAL_ERROR";

function ok(data: Record<string, any>) {
  return NextResponse.json({ ok: true, ...data });
}
function bad(code: ApiErrCode, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

function safeExtByMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4")) return "mp4";
  return "webm";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return bad("UNSUPPORTED_CONTENT_TYPE", 415, "Expected multipart/form-data");
    }

    const fd = await req.formData();
    const noteId = String(fd.get("noteId") || "").trim();
    const chunkIndexStr = String(fd.get("chunkIndex") || "").trim();
    const file = fd.get("file");

    if (!noteId) return bad("MISSING_NOTE_ID", 400);
    if (!chunkIndexStr) return bad("MISSING_CHUNK_INDEX", 400);

    const chunkIndex = Number.parseInt(chunkIndexStr, 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      return bad("INVALID_CHUNK_INDEX", 400, "Invalid chunkIndex");
    }
    if (!(file instanceof File)) return bad("MISSING_FILE", 400, "Missing file");

    // 3MB 限制（你之前的逻辑）
    const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_CHUNK_BYTES) {
      return bad("CHUNK_TOO_LARGE", 413, `Chunk too large. Max ${MAX_CHUNK_BYTES} bytes.`);
    }

    // ✅ 必须：先确认 note 存在且归属正确
    const meta = await getNote(noteId);
    if (!meta) return bad("NOTE_NOT_FOUND", 404);
    if (meta.userId !== userId) return bad("FORBIDDEN", 403);

    // ✅ 1) 落盘保存 chunk 文件
    const root = getNoteRootDir(noteId);              // .tmp/ai-note/<noteId>
    const chunkDir = path.join(root, "chunks");       // .tmp/ai-note/<noteId>/chunks
    await fs.mkdir(chunkDir, { recursive: true });

    const mime = file.type || "audio/webm";
    const ext = safeExtByMime(mime);
    const filename = `chunk-${String(chunkIndex).padStart(6, "0")}.${ext}`;
    const filePath = path.join(chunkDir, filename);

    let buf: Buffer;
    try {
      const ab = await file.arrayBuffer();
      buf = Buffer.from(ab);
      await fs.writeFile(filePath, buf);
    } catch (e: any) {
      return bad("SAVE_FAILED", 500, e?.message || "Failed to save chunk", { filePath });
    }

    // ✅ 2) 写 meta：这是 NO_CHUNKS 的关键！
    await addChunk(noteId, {
      chunkIndex,
      filePath,
      size: file.size,
      mime,
      createdAt: Date.now(),
    });

    // ✅ 3) 可选：做 ASR（失败也别影响 chunks 入库，否则 finalize 永远没 chunk）
    let transcript = "";
    try {
      // 这里直接用原 File 调 ASR；你也可以用落盘后的 buf 再构造
      transcript = String(await transcribeAudioToText(file) || "").trim();
    } catch (e: any) {
      // 不阻断：让 finalize 至少能跑 concat/segment
      console.warn("[ai-note/chunk] ASR failed but chunk saved:", e?.message || e);
      return ok({
        noteId,
        chunkIndex,
        saved: true,
        transcript: "",
        asrOk: false,
        warning: "ASR_FAILED_BUT_CHUNK_SAVED",
      });
    }

    return ok({
      noteId,
      chunkIndex,
      saved: true,
      transcript,
      transcriptChars: transcript.length,
      asrOk: true,
    });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
