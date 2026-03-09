import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStudyUsageStatus } from "@/lib/study/quota";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

    const status = await withPrismaConnectionRetry(
      () => getStudyUsageStatus(userId),
      { maxRetries: 1, retryDelayMs: 120, operationName: "study-usage-status" }
    );

    return NextResponse.json({
      ok: true,
      plan: status.plan,
      limits: status.limits,
      usedToday: status.usedToday,
      remainingToday: status.remainingToday,
    });
  } catch (error) {
    if (isTransientPrismaConnectionError(error)) {
      return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "STUDY_USAGE_FAILED" }, { status: 500 });
  }
}
