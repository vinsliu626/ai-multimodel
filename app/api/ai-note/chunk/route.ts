import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // 3MB chunk 限制（你原本的逻辑）
    const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_CHUNK_BYTES) {
      return bad("CHUNK_TOO_LARGE", 413, `Chunk too large. Max ${MAX_CHUNK_BYTES} bytes.`);
    }

    // ✅ DB 校验 note 存在 & 属于当前用户
    const sessRow = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (!sessRow) return bad("NOTE_NOT_FOUND", 404);
    if (sessRow.userId !== userId) return bad("FORBIDDEN", 403);

    const mime = file.type || "audio/webm";

    // ✅ 读二进制
    let buf: Buffer;
    try {
      const ab = await file.arrayBuffer();
      buf = Buffer.from(ab);
    } catch (e: any) {
      return bad("SAVE_FAILED", 500, e?.message || "Failed to read chunk into buffer");
    }

    // ✅ 存 DB（幂等：同 index 覆盖）
    await prisma.aiNoteChunk.upsert({
      where: { noteId_chunkIndex: { noteId, chunkIndex } },
      update: {
        mime,
        size: file.size,
        data: buf,
      },
      create: {
        noteId,
        chunkIndex,
        mime,
        size: file.size,
        data: buf,
      },
    });

    // ✅ 可选：做 ASR（失败不阻断）
    let transcript = "";
    try {
      transcript = String((await transcribeAudioToText(file)) || "").trim();
    } catch (e: any) {
      console.warn("[ai-note/chunk] ASR failed but chunk saved:", e?.message || e);
      return ok({
        noteId,
        chunkIndex,
        saved: true,
        asrOk: false,
        transcript: "",
        warning: "ASR_FAILED_BUT_CHUNK_SAVED",
      });
    }

    return ok({
      noteId,
      chunkIndex,
      saved: true,
      asrOk: true,
      transcript,
      transcriptChars: transcript.length,
    });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
