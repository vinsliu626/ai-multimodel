import { prisma } from "@/lib/prisma";
import { normalizePlan, planToFlags, type PlanId, type PlanFlags } from "@/lib/billing/planFlags";
import { ensureRuntimeEntitlement, type RuntimeUserEntitlement } from "@/lib/billing/entitlementDb";

export type AccessSource = "developer_override" | "paid_subscription" | "promo" | "free";

export type EffectiveAccess = {
  plan: PlanId;
  source: AccessSource;
  unlimited: boolean;
  entitled: boolean;
  promoExpiresAt: Date | null;
  subscriptionExpiresAt: Date | null;
  flags: PlanFlags;
};

function parseDeveloperBypassAllowlist(): Set<string> {
  const raw = process.env.PREMIUM_BYPASS_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasAllowlistBypass(userId: string): boolean {
  const allowlist = parseDeveloperBypassAllowlist();
  return allowlist.has(userId.trim().toLowerCase());
}

function hasDeveloperBypass(userId: string, _ent: RuntimeUserEntitlement): boolean {
  return hasAllowlistBypass(userId);
}

function hasActivePaidSubscription(ent: RuntimeUserEntitlement, now: Date): boolean {
  const plan = normalizePlan(ent.plan);
  if (plan === "basic") return false;
  if (!ent.stripeSubId) return false;
  if (ent.stripeStatus !== "active") return false;
  if (ent.currentPeriodEnd && ent.currentPeriodEnd.getTime() <= now.getTime()) return false;
  return true;
}

export function resolveEffectiveAccessFromEntitlement(userId: string, ent: RuntimeUserEntitlement, now = new Date()): EffectiveAccess {
  if (hasDeveloperBypass(userId, ent)) {
    const plan = normalizePlan("ultra");
    return {
      plan,
      source: "developer_override",
      unlimited: true,
      entitled: true,
      promoExpiresAt: null,
      subscriptionExpiresAt: ent.currentPeriodEnd ?? null,
      flags: planToFlags(plan),
    };
  }

  if (hasActivePaidSubscription(ent, now)) {
    const plan = normalizePlan(ent.plan);
    return {
      plan,
      source: "paid_subscription",
      unlimited: Boolean(ent.unlimited) || plan === "ultra",
      entitled: true,
      promoExpiresAt: null,
      subscriptionExpiresAt: ent.currentPeriodEnd ?? null,
      flags: planToFlags(plan),
    };
  }

  const plan = normalizePlan("basic");
  return {
    plan,
    source: "free",
    unlimited: false,
    entitled: true,
    promoExpiresAt: null,
    subscriptionExpiresAt: ent.currentPeriodEnd ?? null,
    flags: planToFlags(plan),
  };
}

function resolveBasicAccess(userId: string): EffectiveAccess {
  if (hasAllowlistBypass(userId)) {
    const plan = normalizePlan("ultra");
    return {
      plan,
      source: "developer_override",
      unlimited: true,
      entitled: true,
      promoExpiresAt: null,
      subscriptionExpiresAt: null,
      flags: planToFlags(plan),
    };
  }

  const plan = normalizePlan("basic");
  return {
    plan,
    source: "free",
    unlimited: false,
    entitled: true,
    promoExpiresAt: null,
    subscriptionExpiresAt: null,
    flags: planToFlags(plan),
  };
}

export async function resolveEffectiveAccess(userId: string): Promise<{ entitlement: RuntimeUserEntitlement | null; access: EffectiveAccess }> {
  try {
    const entitlement = await ensureRuntimeEntitlement(prisma, userId);

    const access = resolveEffectiveAccessFromEntitlement(userId, entitlement);
    return { entitlement, access };
  } catch (error) {
    console.warn("[billing.access] entitlement lookup/init failed; falling back to basic access", {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { entitlement: null, access: resolveBasicAccess(userId) };
  }
}
