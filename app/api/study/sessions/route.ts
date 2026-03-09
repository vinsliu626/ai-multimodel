import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";
import { listStudySessions } from "@/lib/study/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    if (!userId) return NextResponse.json({ sessions: [] }, { status: 200 });

    const sessions = await withPrismaConnectionRetry(
      () => listStudySessions(userId),
      { maxRetries: 1, retryDelayMs: 120, operationName: "study-sessions-list" }
    );

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    if (isTransientPrismaConnectionError(error)) {
      return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[/api/study/sessions] error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
