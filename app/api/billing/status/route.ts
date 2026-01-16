// app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;

  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  const ent = await prisma.userEntitlement.findUnique({ where: { userId } });

  // 没有记录就按 basic 给
  const plan = ent?.plan ?? "basic";

  return NextResponse.json({
    ok: true,
    plan,
    unlimited: ent?.unlimited ?? false,

    detectorWordsPerWeek: ent?.detectorWordsPerWeek ?? 5000,
    noteSecondsPerWeek: ent?.noteSecondsPerWeek ?? 2 * 3600,
    chatPerDay: ent?.chatPerDay ?? 10,

    usedDetectorWordsThisWeek: ent?.usedDetectorWordsThisWeek ?? 0,
    usedNoteSecondsThisWeek: ent?.usedNoteSecondsThisWeek ?? 0,
    usedChatCountToday: ent?.usedChatCountToday ?? 0,

    canSeeSuspiciousSentences: ent?.canSeeSuspiciousSentences ?? false,
  });
}
