// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr = "AUTH_REQUIRED" | "DB_ERROR" | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

function dbHead() {
  return String(process.env.DATABASE_URL || "").slice(0, 40);
}

export async function POST() {
  try {
    // ✅ 打印一下到底有没有进来
    console.log("[ai-note/start] hit", { dbHead: dbHead() });

    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) return bad("AUTH_REQUIRED", 401);

    const noteId = randomUUID();

    // ✅ 这里不要调用你不确定的 createNote，直接写 session，最稳定
    await prisma.aiNoteSession.create({
      data: { id: noteId, userId } as any,
    });

    return NextResponse.json({ ok: true, noteId });
  } catch (e: any) {
    // ✅ 一定要打完整错误（你现在缺的就是它）
    console.error("[ai-note/start] ERROR:", e);
    return bad("INTERNAL_ERROR", 500, String(e?.message || e), {
      name: e?.name,
      code: e?.code,
      dbHead: dbHead(),
    });
  }
}
