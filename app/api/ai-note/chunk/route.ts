// app/api/ai-note/chunk/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNoteSession, saveChunkTranscript } from "@/lib/aiNote/sessionStore";
import { transcribeAudioToText } from "@/lib/asr/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return bad("UNSUPPORTED_CONTENT_TYPE", 415);

    const fd = await req.formData();
    const noteId = String(fd.get("noteId") || "").trim();
    const chunkIndexStr = String(fd.get("chunkIndex") || "").trim();
    const file = fd.get("file");

    if (!noteId) return bad("MISSING_NOTE_ID");
    if (!chunkIndexStr) return bad("MISSING_CHUNK_INDEX");

    const chunkIndex = Number.parseInt(chunkIndexStr, 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) return bad("INVALID_CHUNK_INDEX");
    if (!(file instanceof File)) return bad("MISSING_FILE");

    console.log("[ai-note/chunk] pid=", process.pid, "noteId=", noteId, "chunkIndex=", chunkIndex);

    const s = getNoteSession(noteId);
    if (!s) return bad("SESSION_NOT_FOUND", 404);
    if (s.userId !== userId) return bad("FORBIDDEN", 403);

    // 每片限制：3MB
    const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_CHUNK_BYTES) return bad("CHUNK_TOO_LARGE", 413);

    // 1) ASR
    const transcript = await transcribeAudioToText(file);
    const t = transcript.trim();
    if (!t) return bad("ASR_EMPTY", 500);

    // 2) 保存
    saveChunkTranscript(noteId, chunkIndex, t);

    return NextResponse.json({
      ok: true,
      noteId,
      chunkIndex,
      transcript: t,
      transcriptChars: t.length,
    });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e);
    // 注意：这里不要把 Error message 直接暴露给用户也行；你现在先方便调试
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}
