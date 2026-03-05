// app/api/chat/sessions/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) return NextResponse.json({ sessions: [] }, { status: 200 });

    const sessions = await withPrismaConnectionRetry(
      () =>
        prisma.chatSession.findMany({
          where: { userId },
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
          select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true },
        }),
      { maxRetries: 1, retryDelayMs: 120 }
    );

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    if (isTransientPrismaConnectionError(error)) {
      return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[/api/chat/sessions] error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
