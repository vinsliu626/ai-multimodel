// lib/billing/guard.ts
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";


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

/**
 * ✅ 你的产品规则：
 * Basic（免费）：
 *  - detector：5000 words / week
 *  - note：2 hours / week
 *  - chat：10 / day
 *
 * Pro 5.99/月：
 *  - detector：15000 words / week
 *  - note：15 hours / week
 *  - chat：无限
 *
 * Ultra Pro 7.99/月：
 *  - 全部无限
 */
const WEEKLY_LIMITS: Record<
  "basic" | "pro" | "ultra",
  { detector_words: number; note_seconds: number }
> = {
  basic: { detector_words: 5000, note_seconds: 2 * 60 * 60 }, // 2h
  pro: { detector_words: 15000, note_seconds: 15 * 60 * 60 }, // 15h
  ultra: { detector_words: Number.POSITIVE_INFINITY, note_seconds: Number.POSITIVE_INFINITY },
};

const DAILY_CHAT_LIMIT: Record<"basic" | "pro" | "ultra", number> = {
  basic: 10,
  pro: Number.POSITIVE_INFINITY,
  ultra: Number.POSITIVE_INFINITY,
};

// ------------------- time windows (用 UTC，避免服务器时区乱跳) -------------------
function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** ISO week: 周一为一周开始 */
function startOfISOWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun 1=Mon ... 6=Sat
  const diffToMon = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diffToMon);
  return d;
}

function usageTypeOf(action: QuotaAction) {
  if (action === "chat") return "chat_count";
  if (action === "detector") return "detector_words";
  return "note_seconds";
}

function windowStartOf(action: QuotaAction) {
  // chat 按天；detector / note 按周
  if (action === "chat") return startOfTodayUTC();
  return startOfISOWeekUTC();
}

function limitOf(plan: "basic" | "pro" | "ultra", action: QuotaAction) {
  if (action === "chat") return DAILY_CHAT_LIMIT[plan];
  if (action === "detector") return WEEKLY_LIMITS[plan].detector_words;
  return WEEKLY_LIMITS[plan].note_seconds;
}

function errorCodeOf(action: QuotaAction) {
  if (action === "chat") return "CHAT_QUOTA_EXCEEDED";
  if (action === "detector") return "DETECTOR_QUOTA_EXCEEDED";
  return "NOTE_QUOTA_EXCEEDED";
}

/**
 * ✅ 核心：配额检查
 *
 * - giftUnlimited=true -> 永久放行
 * - pro/ultra -> 按上面的规则（pro: chat无限，ultra:全无限）
 *
 * 本地开发绕过：
 * - 设置环境变量 DEV_BYPASS_QUOTA=true 直接放行（仅建议本地）
 */
export async function assertQuotaOrThrow(input: {
  userId: string;
  action: QuotaAction;
  amount: number; // chat=1次；detector=words；note=seconds
}) {
  const { userId, action } = input;
  const amount = Math.max(1, Math.floor(input.amount || 1));

  if (process.env.DEV_BYPASS_QUOTA === "true") return;

  // 1) 读用户权益（没有就当 basic）
  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  let plan = (ent.plan as "basic" | "pro" | "ultra") || "basic";
  const isUnlimited = Boolean(ent.unlimited);

  // ✅ 2) 订阅有效性校验（核心：欠费不能用）
  // 规则：只要 plan 不是 basic，就必须保证 stripeStatus=active（或通过 Stripe 实时确认）
  if (plan !== "basic" && ent.stripeSubId) {
    try {
      const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
      const sub: any = (subResp as any).data ?? subResp;

      const status = (sub.status as string | undefined) ?? null;

      // 同步 DB 的 stripeStatus（推荐）
      if (status && status !== ent.stripeStatus) {
        await prisma.userEntitlement.update({
          where: { userId },
          data: { stripeStatus: status },
        });
      }

      // 🔥 非 active：直接拒绝本次请求（你要的不合理情况就不会发生）
      if (status !== "active") {
        // 可选：同时把用户降级 basic（让前端立刻显示 basic）
        await prisma.userEntitlement.update({
          where: { userId },
          data: {
            plan: "basic",
            unlimited: false,
            canSeeSuspiciousSentences: false,
            detectorWordsPerWeek: WEEKLY_LIMITS.basic.detector_words,
            noteSecondsPerWeek: WEEKLY_LIMITS.basic.note_seconds,
            chatPerDay: DAILY_CHAT_LIMIT.basic,
          },
        });

        throw new QuotaError(
          "PAYMENT_REQUIRED",
          "Subscription inactive (payment failed/canceled). Please renew to continue.",
          402
        );
      }
    } catch (e) {
      // Stripe 查不到订阅：也拒绝，并降级
      await prisma.userEntitlement.update({
        where: { userId },
        data: {
          plan: "basic",
          unlimited: false,
          stripeSubId: null,
          stripeStatus: "missing",
          canSeeSuspiciousSentences: false,
          detectorWordsPerWeek: WEEKLY_LIMITS.basic.detector_words,
          noteSecondsPerWeek: WEEKLY_LIMITS.basic.note_seconds,
          chatPerDay: DAILY_CHAT_LIMIT.basic,
        },
      });

      throw new QuotaError("PAYMENT_REQUIRED", "Subscription missing. Please renew.", 402);
    }
  } else if (plan !== "basic" && !ent.stripeSubId) {
    // 有人 plan=pro/ultra 但没有订阅 id：也不该允许
    await prisma.userEntitlement.update({
      where: { userId },
      data: { plan: "basic", unlimited: false },
    });
    plan = "basic";
    throw new QuotaError("PAYMENT_REQUIRED", "No active subscription found. Please subscribe.", 402);
  }

  // ✅ 3) gift unlimited 直接放行；Ultra 全放行
  if (isUnlimited || plan === "ultra") return;

  // ✅ 4) Pro chat 无限：直接放行 chat
  if (plan === "pro" && action === "chat") return;

  // 5) 查窗口内已用量
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
  const limit = limitOf(plan, action);

  if (Number.isFinite(limit) && used + amount > limit) {
    const remain = Math.max(0, Math.floor(limit - used));
    const code = errorCodeOf(action);

    throw new QuotaError(
      code,
      `Quota exceeded: ${usageType}. used=${used}, limit=${limit}, remaining=${remain}`,
      429
    );
  }
}
