import { QuotaError } from "@/lib/billing/guard";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveAccess } from "@/lib/billing/access";
import { getStudyPlanLimits } from "./limits";

const lastStudyAttemptByUser = new Map<string, number>();

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getStudyUsageStatus(userId: string) {
  const { access } = await resolveEffectiveAccess(userId);
  const limits = getStudyPlanLimits(access.plan);
  const agg = await prisma.usageEvent.aggregate({
    where: {
      userId,
      type: "study_count",
      createdAt: { gte: startOfTodayUTC() },
    },
    _sum: { amount: true },
  });

  const usedToday = agg._sum.amount ?? 0;

  return {
    plan: access.plan,
    source: access.source,
    limits,
    usedToday,
    remainingToday: Math.max(0, limits.generationsPerDay - usedToday),
  };
}

export async function assertStudyQuotaOrThrow(userId: string) {
  const status = await getStudyUsageStatus(userId);
  if (status.usedToday >= status.limits.generationsPerDay) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[study.quota] quota exceeded", {
        userId,
        used: status.usedToday,
        limit: status.limits.generationsPerDay,
        remaining: status.remainingToday,
      });
    }
    throw new QuotaError(
      "STUDY_QUOTA_EXCEEDED",
      "You've used all AI Study generations for today. Upgrade your plan or come back tomorrow for more generations.",
      429
    );
  }
  return status;
}

export function assertStudyCooldownOrThrow(userId: string, cooldownMs: number) {
  const now = Date.now();
  const last = lastStudyAttemptByUser.get(userId) ?? 0;
  const remainingMs = cooldownMs - (now - last);
  if (remainingMs > 0) {
    const retryAfterSec = Math.ceil(remainingMs / 1000);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[study.quota] cooldown active", { userId, remainingMs, retryAfterSec });
    }
    throw new QuotaError(
      "STUDY_COOLDOWN_ACTIVE",
      `Please wait ${retryAfterSec}s before generating another document study set.`,
      429
    );
  }
}

export function markStudyAttempt(userId: string) {
  lastStudyAttemptByUser.set(userId, Date.now());
}
