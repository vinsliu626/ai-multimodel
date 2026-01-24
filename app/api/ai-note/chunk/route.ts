// app/api/ai-note/chunk/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr =
  | "AUTH_REQUIRED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "MISSING_NOTE_ID"
  | "MISSING_CHUNK_INDEX"
  | "INVALID_CHUNK_INDEX"
  | "MISSING_FILE"
  | "FORBIDDEN"
  | "CHUNK_TOO_LARGE"
  | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

function dbHead() {
  // 统一用 DATABASE_URL（Prisma 默认就是这个）
  return String(process.env.DATABASE_URL || "").slice(0, 30);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return bad("UNSUPPORTED_CONTENT_TYPE", 415, "Expected multipart/form-data", { got: ct });
    }

    const fd = await req.formData();
    const noteId = String(fd.get("noteId") || "").trim();
    const chunkIndexStr = String(fd.get("chunkIndex") || "").trim();
    const file = fd.get("file");

    if (!noteId) return bad("MISSING_NOTE_ID", 400);
    if (!chunkIndexStr) return bad("MISSING_CHUNK_INDEX", 400);

    const chunkIndex = Number.parseInt(chunkIndexStr, 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      return bad("INVALID_CHUNK_INDEX", 400, "chunkIndex must be a non-negative integer", {
        chunkIndexStr,
      });
    }

    if (!(file instanceof File)) return bad("MISSING_FILE", 400);

    // 3MB 限制保留（⚠️ 如果你录音 ondataavailable 间隔太长，会一直超 3MB）
    const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_CHUNK_BYTES) {
      return bad("CHUNK_TOO_LARGE", 413, `Max ${MAX_CHUNK_BYTES} bytes`, {
        size: file.size,
        max: MAX_CHUNK_BYTES,
      });
    }

    console.log("[ai-note/chunk] dbHead=", dbHead());
    console.log("[ai-note/chunk] noteId=", noteId, "chunkIndex=", chunkIndex, "bytes=", file.size, "type=", file.type);

    // ✅ 不再要求 session 先存在：先检查是否被其他用户占用
    const existing = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      return bad("FORBIDDEN", 403, "This noteId belongs to another user.", {
        noteId,
      });
    }

    // ✅ upsert session：确保 finalize 一定能 find 到 session
    await prisma.aiNoteSession.upsert({
      where: { id: noteId },
      create: { id: noteId, userId } as any,
      update: { userId } as any,
    });

    // ✅ 写 chunk
    const ab = await file.arrayBuffer();
    const data = Buffer.from(ab);

    await prisma.aiNoteChunk.upsert({
      where: { noteId_chunkIndex: { noteId, chunkIndex } },
      update: { mime: file.type || "audio/webm", size: file.size, data },
      create: {
        noteId,
        chunkIndex,
        mime: file.type || "audio/webm",
        size: file.size,
        data,
      },
    });

    // ✅ Debug：写完后立刻数一下（你在 Network 里能看到是否真的写进去了）
    const sess2 = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });
    const count = await prisma.aiNoteChunk.count({ where: { noteId } });

    return NextResponse.json({
      ok: true,
      saved: true,
      noteId,
      chunkIndex,
      dbHead: dbHead(),
      userId,
      sessionUserId: sess2?.userId ?? null,
      chunksNow: count,
    });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error", { dbHead: dbHead() });
  }
}
