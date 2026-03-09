// lib/billing/guard.ts
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { planToFlags } from "@/lib/billing/planFlags";
import { resolveEffectiveAccessFromEntitlement } from "@/lib/billing/access";

export type QuotaAction = "chat" | "detector" | "note";

export class QuotaError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfISOWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMon);
  return d;
}

function usageTypeOf(action: QuotaAction) {
  if (action === "chat") return "chat_count";
  if (action === "detector") return "detector_words";
  return "note_seconds";
}

function windowStartOf(action: QuotaAction) {
  if (action === "chat") return startOfTodayUTC();
  return startOfISOWeekUTC();
}

function errorCodeOf(action: QuotaAction) {
  if (action === "chat") return "CHAT_QUOTA_EXCEEDED";
  if (action === "detector") return "DETECTOR_QUOTA_EXCEEDED";
  return "NOTE_QUOTA_EXCEEDED";
}

function limitOf(
  ent: { plan: string; detectorWordsPerWeek: number | null; noteSecondsPerWeek: number | null; chatPerDay: number | null },
  action: QuotaAction
) {
  if (action === "chat") return ent.chatPerDay;
  if (action === "detector") return ent.detectorWordsPerWeek;
  return ent.noteSecondsPerWeek;
}

export async function assertQuotaOrThrow(input: {
  userId: string;
  action: QuotaAction;
  amount: number;
}) {
  const { userId, action } = input;
  const amount = Math.max(1, Math.floor(input.amount || 1));

  if (process.env.DEV_BYPASS_QUOTA === "true") return;

  let ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "basic" },
  });

  // Runtime expiry enforcement for promo grants.
  if (ent.promoAccessActive && ent.promoAccessEndAt && ent.promoAccessEndAt.getTime() <= Date.now()) {
    ent = await prisma.userEntitlement.update({
      where: { userId },
      data: { promoAccessActive: false },
    });
  }

  const access = resolveEffectiveAccessFromEntitlement(userId, ent);
  const plan = access.plan;

  if (access.source === "developer_override") return;
  if (access.unlimited || plan === "ultra") return;

  // Promo grant path: trust runtime grant validity, no stripe checks.
  if (access.source !== "promo" && plan !== "basic") {
    if (!ent.stripeSubId) {
      const flags = planToFlags("basic");
      await prisma.userEntitlement.update({
        where: { userId },
        data: { ...flags, stripeStatus: "missing", stripeSubId: null, unlimited: false },
      });
      throw new QuotaError("PAYMENT_REQUIRED", "No active subscription found. Please subscribe.", 402);
    }

    try {
      const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
      const sub = (subResp as any).data ?? subResp;

      const status = (sub?.status as string | undefined) ?? null;
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end ?? false);

      await prisma.userEntitlement.update({
        where: { userId },
        data: {
          stripeStatus: status ?? ent.stripeStatus ?? null,
          currentPeriodEnd: periodEnd ?? undefined,
          cancelAtPeriodEnd,
        },
      });

      if (status !== "active") {
        const flags = planToFlags("basic");
        await prisma.userEntitlement.update({
          where: { userId },
          data: { ...flags, stripeStatus: status ?? "inactive", unlimited: false },
        });
        throw new QuotaError("PAYMENT_REQUIRED", "Subscription inactive (payment failed/canceled). Please renew.", 402);
      }
    } catch {
      const flags = planToFlags("basic");
      await prisma.userEntitlement.update({
        where: { userId },
        data: {
          ...flags,
          stripeSubId: null,
          stripeStatus: "missing",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          unlimited: false,
        },
      });
      throw new QuotaError("PAYMENT_REQUIRED", "Subscription missing. Please renew.", 402);
    }
  }

  if (plan === "pro" && action === "chat") return;

  const flags = access.flags;
  const effective = {
    plan,
    detectorWordsPerWeek: (ent.detectorWordsPerWeek ?? flags.detectorWordsPerWeek ?? null) as number | null,
    noteSecondsPerWeek: (ent.noteSecondsPerWeek ?? flags.noteSecondsPerWeek ?? null) as number | null,
    chatPerDay: (ent.chatPerDay ?? flags.chatPerDay ?? null) as number | null,
  };

  const limit = limitOf(effective, action);
  if (limit === null) return;

  const usageType = usageTypeOf(action);
  const since = windowStartOf(action);

  const agg = await prisma.usageEvent.aggregate({
    where: {
      userId,
      type: usageType,
      createdAt: { gte: since },
    },
    _sum: { amount: true },
  });

  const used = agg._sum.amount ?? 0;

  if (used + amount > limit) {
    const remain = Math.max(0, Math.floor(limit - used));
    const code = errorCodeOf(action);
    throw new QuotaError(code, `Quota exceeded: ${usageType}. used=${used}, limit=${limit}, remaining=${remain}`, 429);
  }
}
