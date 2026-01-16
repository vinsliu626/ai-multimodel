// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { randomUUID } from "crypto";
import { createNote } from "@/lib/aiNote/noteStore";

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

    // ✅ 关键：把 createNote 的异常也抓出来
    await createNote(noteId, userId);

    return NextResponse.json({ ok: true, noteId });
  } catch (e: any) {
    console.error("[/api/ai-note/start] ERROR:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "START_FAILED",
        message: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
