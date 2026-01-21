// app/api/ai-note/chunk/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr =
  | "AUTH_REQUIRED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "MISSING_NOTE_ID"
  | "MISSING_CHUNK_INDEX"
  | "INVALID_CHUNK_INDEX"
  | "MISSING_FILE"
  | "NOTE_NOT_FOUND"
  | "FORBIDDEN"
  | "CHUNK_TOO_LARGE"
  | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string) {
  return NextResponse.json({ ok: false, error: code, message: message ?? code }, { status });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return bad("UNSUPPORTED_CONTENT_TYPE", 415, "Expected multipart/form-data");

    const fd = await req.formData();
    const noteId = String(fd.get("noteId") || "").trim();
    const chunkIndexStr = String(fd.get("chunkIndex") || "").trim();
    const file = fd.get("file");

    if (!noteId) return bad("MISSING_NOTE_ID", 400);
    if (!chunkIndexStr) return bad("MISSING_CHUNK_INDEX", 400);
    const chunkIndex = Number.parseInt(chunkIndexStr, 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) return bad("INVALID_CHUNK_INDEX", 400);

    if (!(file instanceof File)) return bad("MISSING_FILE", 400);

    // 你原来 3MB 限制保留
    const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_CHUNK_BYTES) return bad("CHUNK_TOO_LARGE", 413, `Max ${MAX_CHUNK_BYTES} bytes`);

    const sess = await prisma.aiNoteSession.findUnique({ where: { id: noteId }, select: { userId: true } });
    if (!sess) return bad("NOTE_NOT_FOUND", 404);
    if (sess.userId !== userId) return bad("FORBIDDEN", 403);

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

    return NextResponse.json({ ok: true, noteId, chunkIndex, saved: true });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}
