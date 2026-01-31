// lib/billing/guard.ts
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { normalizePlan, planToFlags } from "@/lib/billing/planFlags";

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

// ------------------- time windows (UTC) -------------------
function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** ISO week start (Mon) */
function startOfISOWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
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

function limitOf(ent: { plan: string; detectorWordsPerWeek: number | null; noteSecondsPerWeek: number | null; chatPerDay: number | null }, action: QuotaAction) {
  // 优先用 DB 里的额度（可以被礼包/自定义覆盖）
  if (action === "chat") return ent.chatPerDay;
  if (action === "detector") return ent.detectorWordsPerWeek;
  return ent.noteSecondsPerWeek;
}

function isActivePaidPlan(plan: string) {
  const p = normalizePlan(plan);
  return p === "pro" || p === "ultra";
}

/**
 * ✅ 核心：配额检查
 * - DEV_BYPASS_QUOTA=true -> 放行（仅本地）
 * - unlimited=true -> 放行
 * - plan=ultra -> 放行
 * - plan=pro:
 *    - chat -> 放行
 *    - detector/note -> 按周额度
 * - plan=basic:
 *    - chat -> 按天
 *    - detector/note -> 按周
 *
 * ✅ 严格订阅校验：
 * - 只要 plan 不是 basic：必须 stripeStatus=active
 * - 有 stripeSubId：实时 retrieve 同步
 * - 没 stripeSubId：直接降 basic（避免出现“伪 pro”）
 */
export async function assertQuotaOrThrow(input: {
  userId: string;
  action: QuotaAction;
  amount: number;
}) {
  const { userId, action } = input;
  const amount = Math.max(1, Math.floor(input.amount || 1));

  if (process.env.DEV_BYPASS_QUOTA === "true") return;

  // 1) 读 ent（没有则创建 basic）
  let ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "basic" },
  });

  const plan = normalizePlan(ent.plan);
  const unlimited = Boolean(ent.unlimited);

  // 2) unlimited / ultra -> 放行
  if (unlimited || plan === "ultra") return;

  // 3) 严格：非 basic 需要订阅有效
  if (plan !== "basic") {
    // 没有 stripeSubId：不允许
    if (!ent.stripeSubId) {
      const flags = planToFlags("basic");
      ent = await prisma.userEntitlement.update({
        where: { userId },
        data: { ...flags, stripeStatus: "missing", stripeSubId: null, unlimited: false },
      });
      throw new QuotaError("PAYMENT_REQUIRED", "No active subscription found. Please subscribe.", 402);
    }

    try {
      const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
      const sub: any = (subResp as any).data ?? subResp;

      const status = (sub?.status as string | undefined) ?? null;
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end ?? false);

      // 同步状态到 DB
      ent = await prisma.userEntitlement.update({
        where: { userId },
        data: {
          stripeStatus: status ?? ent.stripeStatus ?? null,
          currentPeriodEnd: periodEnd ?? undefined,
          cancelAtPeriodEnd,
        },
      });

      // 非 active：降 basic 并拒绝
      if (status !== "active") {
        const flags = planToFlags("basic");
        await prisma.userEntitlement.update({
          where: { userId },
          data: { ...flags, stripeStatus: status ?? "inactive", unlimited: false },
        });

        throw new QuotaError("PAYMENT_REQUIRED", "Subscription inactive (payment failed/canceled). Please renew.", 402);
      }
    } catch (e: any) {
      // Stripe 查不到 / 网络错误：为了安全，降 basic 并拒绝
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

  // 4) pro chat -> 放行
  if (plan === "pro" && action === "chat") return;

  // 5) 额度上限：优先用 DB 的字段；如果为空就用 planToFlags 的默认
  const flags = planToFlags(plan);
  const effective = {
    plan,
    detectorWordsPerWeek: (ent.detectorWordsPerWeek ?? flags.detectorWordsPerWeek ?? null) as number | null,
    noteSecondsPerWeek: (ent.noteSecondsPerWeek ?? flags.noteSecondsPerWeek ?? null) as number | null,
    chatPerDay: (ent.chatPerDay ?? flags.chatPerDay ?? null) as number | null,
  };

  const limit = limitOf(effective, action);

  // null => 无限
  if (limit === null) return;

  // 6) 查窗口内已用量
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