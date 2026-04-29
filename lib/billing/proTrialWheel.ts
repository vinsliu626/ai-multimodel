import { prisma, withPrismaRetry } from "@/lib/prisma";
import { resolveEffectiveAccess } from "@/lib/billing/access";
import { createDebugWheelPrizeCode } from "@/lib/billing/debugWheelCodeStore";
import {
  PRO_TRIAL_WHEEL_PRIZES,
  type ProTrialWheelSpinResult,
  type ProTrialWheelStatus,
} from "@/lib/billing/proTrialWheelTypes";

const WHEEL_SPIN_EVENT_TYPE = "pro_trial_wheel_spin";

function pickPrizeDurationDays() {
  const total = PRO_TRIAL_WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
  let target = Math.random() * total;

  for (const prize of PRO_TRIAL_WHEEL_PRIZES) {
    target -= prize.weight;
    if (target <= 0) return prize.durationDays;
  }

  return PRO_TRIAL_WHEEL_PRIZES[PRO_TRIAL_WHEEL_PRIZES.length - 1].durationDays;
}

async function getSpinUsage(userId: string) {
  return withPrismaRetry(
    () =>
      prisma.usageEvent.findFirst({
        where: { userId, type: WHEEL_SPIN_EVENT_TYPE },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    {
      maxRetries: 2,
      retryDelayMs: 150,
      operationName: "billing.wheel.read-spin-usage",
    }
  );
}

export async function getProTrialWheelStatus(userId: string): Promise<ProTrialWheelStatus> {
  const [{ access }, spinUsage] = await Promise.all([resolveEffectiveAccess(userId), getSpinUsage(userId)]);
  const hasSpun = Boolean(spinUsage);

  return {
    ok: true,
    userId,
    canSpin: access.plan === "basic" && !hasSpun,
    devUnlimitedSpins: false,
    hasSpun,
    spinUsedAt: spinUsage?.createdAt.toISOString() ?? null,
    activeTrialEndsAt:
      access.source === "promo" || access.source === "paid_subscription"
        ? (access.promoExpiresAt ?? access.subscriptionExpiresAt)?.toISOString() ?? null
        : null,
  };
}

export async function spinProTrialWheel(userId: string): Promise<ProTrialWheelSpinResult> {
  const currentStatus = await getProTrialWheelStatus(userId);
  if (!currentStatus.canSpin) {
    throw new Error(currentStatus.hasSpun ? "PRO_TRIAL_WHEEL_ALREADY_USED" : "PRO_TRIAL_WHEEL_NOT_ELIGIBLE");
  }

  const prizeDurationDays = pickPrizeDurationDays();
  const result = await withPrismaRetry(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pro-trial-wheel:${userId}`}))`;

        const existingSpin = await tx.usageEvent.findFirst({
          where: { userId, type: WHEEL_SPIN_EVENT_TYPE },
          select: { createdAt: true },
        });
        if (existingSpin) {
          throw new Error("PRO_TRIAL_WHEEL_ALREADY_USED");
        }

        await tx.usageEvent.create({
          data: {
            userId,
            type: WHEEL_SPIN_EVENT_TYPE,
            amount: prizeDurationDays,
          },
        });

        return {
          spinUsedAt: new Date(),
        };
      }),
    {
      maxRetries: 2,
      retryDelayMs: 180,
      operationName: "billing.wheel.consume-spin",
    }
  );

  const codeEntry = createDebugWheelPrizeCode({
    durationDays: prizeDurationDays,
    userId,
  });

  const status: ProTrialWheelStatus = {
    ...currentStatus,
    canSpin: false,
    hasSpun: true,
    spinUsedAt: result.spinUsedAt.toISOString(),
  };

  return {
    ok: true,
    prizeDurationDays,
    code: codeEntry.code,
    codeExpiresAt: new Date(codeEntry.expiresAt).toISOString(),
    status,
  };
}
