import { Prisma, PromoTargetPlan, type PromoCode } from "@prisma/client";
import { normalizePlan, type PlanId } from "@/lib/billing/planFlags";
import { mutationResultSelect } from "@/lib/billing/entitlementDb";

type RedeemFailureCode =
  | "INVALID_CODE"
  | "INACTIVE_CODE"
  | "NOT_STARTED"
  | "CODE_EXPIRED"
  | "CODE_EXHAUSTED"
  | "PER_USER_LIMIT_REACHED"
  | "INVALID_GRANT_WINDOW";

export type PromoRedeemSuccess = {
  ok: true;
  plan: PlanId;
  grantEndAt: Date | null;
  source: string;
};

export type PromoRedeemFailure = {
  ok: false;
  error: RedeemFailureCode;
};

export type PromoRedeemResult = PromoRedeemSuccess | PromoRedeemFailure;

export function promoTargetPlanToPlanId(targetPlan: PromoTargetPlan): PlanId {
  return normalizePlan(targetPlan === "ULTRA" ? "ultra" : "pro");
}

function computeGrantEndAt(now: Date, promo: PromoCode): Date | null {
  if (promo.grantFixedEndsAt) return promo.grantFixedEndsAt;
  if (promo.grantDurationDays && promo.grantDurationDays > 0) {
    const ms = promo.grantDurationDays * 24 * 60 * 60 * 1000;
    return new Date(now.getTime() + ms);
  }
  return null;
}

function isWindowInvalid(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt && now.getTime() < startsAt.getTime()) return true;
  if (endsAt && now.getTime() >= endsAt.getTime()) return true;
  return false;
}

function pickLongerExpiry(current: Date | null, incoming: Date | null): Date | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return current.getTime() >= incoming.getTime() ? current : incoming;
}

function pickHigherPlan(current: string | null, incoming: PromoTargetPlan): string {
  const incomingPlan = promoTargetPlanToPlanId(incoming);
  if (!current) return incomingPlan;
  const cur = normalizePlan(current);
  if (cur === "ultra" || incomingPlan === "ultra") return "ultra";
  return "pro";
}

export async function redeemPromoCodeTx(
  tx: Prisma.TransactionClient,
  userId: string,
  promo: PromoCode,
  now: Date
): Promise<PromoRedeemResult> {
  if (!promo.isActive) return { ok: false, error: "INACTIVE_CODE" };
  if (promo.startsAt && now.getTime() < promo.startsAt.getTime()) return { ok: false, error: "NOT_STARTED" };
  if (promo.expiresAt && now.getTime() >= promo.expiresAt.getTime()) return { ok: false, error: "CODE_EXPIRED" };
  if (promo.maxRedemptions !== null && promo.redeemedCount >= promo.maxRedemptions) {
    return { ok: false, error: "CODE_EXHAUSTED" };
  }

  const perUserLimit = promo.perUserLimit > 0 ? promo.perUserLimit : 1;
  const existingCount = await tx.promoRedemption.count({
    where: { promoCodeId: promo.id, userId },
  });
  if (existingCount >= perUserLimit) return { ok: false, error: "PER_USER_LIMIT_REACHED" };

  const grantStartAt = now;
  const grantEndAt = computeGrantEndAt(now, promo);
  if (isWindowInvalid(now, grantStartAt, grantEndAt)) return { ok: false, error: "INVALID_GRANT_WINDOW" };

  await tx.promoRedemption.create({
    data: {
      promoCodeId: promo.id,
      userId,
      grantedPlan: promo.targetPlan,
      grantStartAt,
      grantEndAt,
      grantStatus: grantEndAt ? "active" : "active_unbounded",
    },
  });

  await tx.promoCode.update({
    where: { id: promo.id },
    data: {
      redeemedCount: { increment: 1 },
      lastRedeemedAt: now,
    },
  });

  await tx.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "basic" },
    select: mutationResultSelect,
  });

  try {
    await tx.userEntitlement.update({
      where: { userId },
      data: {
        promoPlan: pickHigherPlan(null, promo.targetPlan),
        promoAccessStartAt: grantStartAt,
        promoAccessEndAt: pickLongerExpiry(null, grantEndAt),
        promoAccessActive: true,
      },
      select: mutationResultSelect,
    });
  } catch {
    // Older live schemas may not have promo entitlement columns yet.
  }

  return {
    ok: true,
    plan: promoTargetPlanToPlanId(promo.targetPlan),
    grantEndAt,
    source: promo.codeType.toLowerCase(),
  };
}
