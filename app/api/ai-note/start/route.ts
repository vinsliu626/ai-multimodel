// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createNoteSession } from "@/lib/aiNote/sessionStore";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  const noteId = randomUUID();
  createNoteSession(noteId, userId);

  // ✅ 调试：确认 start 和 chunk 是否在同一 pid（同一实例）
  console.log("[ai-note/start] pid=", process.pid, "noteId=", noteId, "userId=", userId);

  return NextResponse.json({ ok: true, noteId });
}
