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
  | "MISSING_DATA"
  | "FORBIDDEN"
  | "CHUNK_TOO_LARGE"
  | "BAD_BODY"
  | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

// 统一把各种 data 形态转成 Buffer（支持 base64 / Buffer JSON）
function bytesToBuffer(data: any, encoding?: string): Buffer {
  if (!data) throw new Error("data is empty");

  if (Buffer.isBuffer(data)) return data;

  // { type:"Buffer", data:[...] }
  if (data && typeof data === "object" && data.type === "Buffer" && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }

  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));

  // string: base64 or utf8
  if (typeof data === "string") {
    const enc = String(encoding || "").toLowerCase();
    if (enc === "base64") return Buffer.from(data, "base64");

    // 兜底：先当 base64 试试，不行再 utf8
    try {
      return Buffer.from(data, "base64");
    } catch {
      return Buffer.from(data, "utf8");
    }
  }

  // array of bytes
  if (Array.isArray(data)) return Buffer.from(data);

  throw new Error(`Unsupported data type: typeof=${typeof data}`);
}

function parseChunkIndex(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return { ok: false as const, value: 0, raw: s };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return { ok: false as const, value: 0, raw: s };
  return { ok: true as const, value: n, raw: s };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const ct = (req.headers.get("content-type") || "").toLowerCase();

    let noteId = "";
    let chunkIndex: number | null = null;
    let mime = "audio/webm";
    let dataBuf: Buffer | null = null;

    // 1) JSON 模式（给你的 node 脚本用）
    if (ct.includes("application/json")) {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return bad("BAD_BODY", 400, "Invalid JSON body");
      }

      noteId = String(body?.noteId || "").trim();
      const idx = parseChunkIndex(body?.chunkIndex);
      if (idx.ok) chunkIndex = idx.value;

      mime = String(body?.mime || "audio/webm");
      const encoding = String(body?.encoding || "base64");

      try {
        dataBuf = bytesToBuffer(body?.data, encoding);
      } catch (e: any) {
        return bad("MISSING_DATA", 400, e?.message || "Missing/invalid data");
      }
    }

    // 2) multipart 模式（给浏览器 File 上传用）
    else if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      noteId = String(fd.get("noteId") || "").trim();

      const idx = parseChunkIndex(fd.get("chunkIndex"));
      if (idx.ok) chunkIndex = idx.value;

      const file = fd.get("file");
      if (!(file instanceof File)) return bad("MISSING_DATA", 400, "Missing file field");

      mime = file.type || "audio/webm";
      const ab = await file.arrayBuffer();
      dataBuf = Buffer.from(ab);
    }

    // 其他类型不支持
    else {
      return bad("UNSUPPORTED_CONTENT_TYPE", 415, "Expected application/json or multipart/form-data", { got: ct });
    }

    if (!noteId) return bad("MISSING_NOTE_ID", 400);
    if (chunkIndex === null) return bad("MISSING_CHUNK_INDEX", 400);
    if (chunkIndex < 0) return bad("INVALID_CHUNK_INDEX", 400);

    if (!dataBuf) return bad("MISSING_DATA", 400);

    // 统一限制（你脚本 1MB / 2.5MB 都 OK）
    const MAX_CHUNK_BYTES = Number.parseInt(process.env.AI_NOTE_MAX_CHUNK_BYTES || "", 10) || 3 * 1024 * 1024;
    if (dataBuf.length > MAX_CHUNK_BYTES) {
      return bad("CHUNK_TOO_LARGE", 413, `Max ${MAX_CHUNK_BYTES} bytes`, {
        size: dataBuf.length,
        max: MAX_CHUNK_BYTES,
      });
    }

    // ✅ 检查 noteId 是否属于该用户；不存在则创建 session（与你原逻辑一致）
    const existing = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      return bad("FORBIDDEN", 403, "This noteId belongs to another user.", { noteId });
    }

    await prisma.aiNoteSession.upsert({
      where: { id: noteId },
      create: { id: noteId, userId } as any,
      update: { userId } as any,
    });

    // ✅ 写 chunk（支持 base64/json or multipart/file）
    await prisma.aiNoteChunk.upsert({
      where: { noteId_chunkIndex: { noteId, chunkIndex } },
      update: { mime, size: dataBuf.length, data: dataBuf } as any,
      create: { noteId, chunkIndex, mime, size: dataBuf.length, data: dataBuf } as any,
    });

    const chunksNow = await prisma.aiNoteChunk.count({ where: { noteId } });

    return NextResponse.json({
      ok: true,
      noteId,
      chunkIndex,
      bytes: dataBuf.length,
      mime,
      chunksNow,
    });
  } catch (e: any) {
    console.error("[ai-note/chunk] error:", e?.message || e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}