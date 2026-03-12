import { prisma } from "@/lib/prisma";
import { startOfTodayUTC } from "@/lib/billing/time";
import { resolveEffectiveAccess } from "@/lib/billing/access";
import { addUsageEvent } from "@/lib/billing/usage";
import { getNotePlanLimits } from "@/lib/plans/productLimits";
import { getStagedNoteMaxChars } from "@/lib/aiNote/staged";

const lastNoteAttemptByUser = new Map<string, number>();

export class NoteLimitError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getNoteQuotaStatus(userId: string) {
  const { access } = await resolveEffectiveAccess(userId);
  const limits = getNotePlanLimits(access.plan);
  const usedAgg = await prisma.usageEvent.aggregate({
    where: { userId, type: "note_generate_count", createdAt: { gte: startOfTodayUTC() } },
    _sum: { amount: true },
  });

  return {
    plan: access.plan,
    limits,
    usedToday: usedAgg._sum.amount ?? 0,
    remainingToday: Math.max(0, limits.generatesPerDay - (usedAgg._sum.amount ?? 0)),
  };
}

export async function assertNoteRequestAllowed(
  userId: string,
  inputChars: number,
  opts?: { allowStaged?: boolean }
) {
  const { limits, usedToday } = await getNoteQuotaStatus(userId);
  const now = Date.now();
  const last = lastNoteAttemptByUser.get(userId) ?? 0;
  const stagedAllowed = Boolean(opts?.allowStaged);
  const stagedMaxChars = Math.min(getStagedNoteMaxChars(), limits.maxInputChars);
  const stagedTriggerChars = Math.min(stagedMaxChars, Math.max(6_000, Math.floor(stagedMaxChars * 0.55)));
  const requiresStaged = stagedAllowed && inputChars > stagedTriggerChars;

  if (inputChars > stagedMaxChars) {
    throw new NoteLimitError("NOTE_INPUT_TOO_LARGE", "This text is too long for your current plan.", 400);
  }

  const cooldownRemainingMs = limits.cooldownMs - (now - last);
  if (cooldownRemainingMs > 0) {
    throw new NoteLimitError("NOTE_COOLDOWN_ACTIVE", "Please wait a moment before sending another request.", 429);
  }

  if (usedToday >= limits.generatesPerDay) {
    throw new NoteLimitError("NOTE_DAILY_LIMIT_REACHED", "You've used all AI Note generations for today.", 429);
  }

  return {
    limits,
    mode: requiresStaged ? ("staged" as const) : ("standard" as const),
    stagedMaxChars,
    stagedTriggerChars,
  };
}

export function markNoteAttempt(userId: string) {
  lastNoteAttemptByUser.set(userId, Date.now());
}

export async function recordNoteGenerateSuccess(userId: string) {
  await addUsageEvent(userId, "note_generate_count", 1);
}
