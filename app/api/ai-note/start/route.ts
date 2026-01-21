// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  const noteId = randomUUID();

  await prisma.aiNoteSession.create({
    data: { id: noteId, userId },
  });

  await prisma.aiNoteJob.upsert({
    where: { noteId },
    update: { stage: "asr", progress: 0, error: null },
    create: { noteId, userId, stage: "asr", progress: 0 },
  });

  return NextResponse.json({ ok: true, noteId });
}
