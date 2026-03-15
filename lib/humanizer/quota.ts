import { prisma } from "@/lib/prisma";
import { resolveEffectiveAccess } from "@/lib/billing/access";
import { startOfThisWeekUTC } from "@/lib/billing/time";
import { addUsageEvent } from "@/lib/billing/usage";
import { getHumanizerPlanLimits } from "@/lib/plans/productLimits";

const lastHumanizerAttemptByUser = new Map<string, number>();

export class HumanizerLimitError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getHumanizerQuotaStatus(userId: string) {
  const { access } = await resolveEffectiveAccess(userId);
  const limits = getHumanizerPlanLimits(access.plan);
  const usedAgg = await prisma.usageEvent.aggregate({
    where: { userId, type: "humanizer_words", createdAt: { gte: startOfThisWeekUTC() } },
    _sum: { amount: true },
  });

  const usedThisWeek = usedAgg._sum.amount ?? 0;

  return {
    plan: access.plan,
    limits,
    usedThisWeek,
    remainingThisWeek: Math.max(0, limits.wordsPerWeek - usedThisWeek),
  };
}

export async function assertHumanizerRequestAllowed(userId: string, inputWords: number) {
  const status = await getHumanizerQuotaStatus(userId);
  const now = Date.now();
  const last = lastHumanizerAttemptByUser.get(userId) ?? 0;
  const cooldownRemainingMs = status.limits.cooldownMs - (now - last);

  if (inputWords < status.limits.minInputWords) {
    throw new HumanizerLimitError("HUMANIZER_INPUT_TOO_SHORT", "Please enter at least 20 words.", 400);
  }

  if (inputWords > status.limits.maxInputWords) {
    throw new HumanizerLimitError("HUMANIZER_INPUT_TOO_LARGE", "This request exceeds your plan's Humanizer limit.", 400);
  }

  if (cooldownRemainingMs > 0) {
    throw new HumanizerLimitError("HUMANIZER_COOLDOWN_ACTIVE", "Please wait a moment before submitting another Humanizer request.", 429);
  }

  if (status.usedThisWeek + inputWords > status.limits.wordsPerWeek) {
    throw new HumanizerLimitError("HUMANIZER_WEEKLY_LIMIT_REACHED", "You've reached your weekly Humanizer limit.", 429);
  }

  return status;
}

export function markHumanizerAttempt(userId: string) {
  lastHumanizerAttemptByUser.set(userId, Date.now());
}

export async function recordHumanizerSuccess(userId: string, inputWords: number) {
  await addUsageEvent(userId, "humanizer_words", inputWords);
}
