import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const noteId = randomUUID();

    await prisma.aiNoteSession.create({
      data: { id: noteId, userId },
    });

    return NextResponse.json({ ok: true, noteId });
  } catch (e: any) {
    console.error("[ai-note/start] error:", e);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
