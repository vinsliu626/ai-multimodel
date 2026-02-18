//app/api/ai-note/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {}

  const noteId = String(body?.noteId || "").trim();
  if (!noteId) return NextResponse.json({ ok: false, error: "MISSING_NOTE_ID" }, { status: 400 });

  const job = await prisma.aiNoteJob.findUnique({
    where: { noteId },
    select: {
      noteId: true,
      userId: true,
      stage: true,
      progress: true,
      error: true,
      segmentsTotal: true,
      asrNextIndex: true,
      llmNextPart: true,
      llmPartsTotal: true,
      noteMarkdown: true,
      secondsBilled: true,
      updatedAt: true,
    },
  });

  if (!job) return NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
  if (job.userId !== userId) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  return NextResponse.json({ ok: true, job });
}