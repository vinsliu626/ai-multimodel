// lib/billing/entitlement.ts
import { prisma } from "@/lib/prisma";
import { normalizePlan, planToFlags } from "@/lib/billing/planFlags";

export type UsageType = "chat_count" | "detector_words" | "note_seconds";

function dayKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function getLimits(plan: string) {
  const p = normalizePlan(plan);
  return planToFlags(p);
}

export class BillingError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * ✅ 强校验 + 扣减：
 * - unlimited 放行
 * - pro/ultra 必须 stripeStatus === "active"
 * - 并发锁：pg_advisory_xact_lock
 * - 事务内重置日/周 key + 扣减 + 写 UsageEvent
 */
export async function requireAndConsume(userId: string, type: UsageType, amount: number) {
  if (!userId) throw new BillingError("AUTH_REQUIRED", "auth required", 401);
  if (!Number.isFinite(amount) || amount <= 0) throw new BillingError("INVALID_AMOUNT", "invalid amount", 400);

  const today = dayKey();
  const thisWeek = weekKey();

  // 1) 先拿 entitlement（会在事务里再锁/再写）
  // 用数组式 transaction，避免 tx 类型推断问题
  return prisma.$transaction(async () => {
    // ✅ 并发锁（同一 userId 串行化）
    // 注意：用 $executeRaw（参数化）替代 unsafe
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const ent = await prisma.userEntitlement.upsert({
      where: { userId },
      update: {},
      create: { userId, plan: "basic" },
    });

    // 重置（跨天/跨周）
    const needDailyReset = ent.dailyUsageKey !== today;
    const needWeeklyReset = ent.weeklyUsageKey !== thisWeek;

    let ent2 = ent;

    if (needDailyReset || needWeeklyReset) {
      ent2 = await prisma.userEntitlement.update({
        where: { userId },
        data: {
          dailyUsageKey: today,
          weeklyUsageKey: thisWeek,
          usedChatCountToday: needDailyReset ? 0 : ent.usedChatCountToday,
          usedDetectorWordsThisWeek: needWeeklyReset ? 0 : ent.usedDetectorWordsThisWeek,
          usedNoteSecondsThisWeek: needWeeklyReset ? 0 : ent.usedNoteSecondsThisWeek,
        },
      });
    }

    // entitlement 判断（严格欠费禁用）
    const plan = normalizePlan(ent2.plan);
    const isPaidPlan = plan !== "basic";

    if (!ent2.unlimited && isPaidPlan) {
      if (ent2.stripeStatus !== "active") {
        throw new BillingError("PAYMENT_REQUIRED", "subscription inactive", 402);
      }
      if (ent2.currentPeriodEnd && ent2.currentPeriodEnd.getTime() <= Date.now()) {
        throw new BillingError("SUB_EXPIRED", "subscription expired", 402);
      }
    }

    const limits = getLimits(plan);

    const detectorLimit = ent2.detectorWordsPerWeek ?? limits.detectorWordsPerWeek; // number|null
    const noteLimit = ent2.noteSecondsPerWeek ?? limits.noteSecondsPerWeek;
    const chatLimit = ent2.chatPerDay ?? limits.chatPerDay;

    // 扣减 + 校验
    if (!ent2.unlimited) {
      if (type === "detector_words") {
        const used = ent2.usedDetectorWordsThisWeek ?? 0;
        if (detectorLimit !== null && used + amount > detectorLimit) {
          throw new BillingError("QUOTA_EXCEEDED", "detector quota exceeded", 429);
        }
        await prisma.userEntitlement.update({
          where: { userId },
          data: { usedDetectorWordsThisWeek: { increment: amount } },
        });
      } else if (type === "note_seconds") {
        const used = ent2.usedNoteSecondsThisWeek ?? 0;
        if (noteLimit !== null && used + amount > noteLimit) {
          throw new BillingError("QUOTA_EXCEEDED", "note quota exceeded", 429);
        }
        await prisma.userEntitlement.update({
          where: { userId },
          data: { usedNoteSecondsThisWeek: { increment: amount } },
        });
      } else if (type === "chat_count") {
        const used = ent2.usedChatCountToday ?? 0;
        if (chatLimit !== null && used + amount > chatLimit) {
          throw new BillingError("QUOTA_EXCEEDED", "chat quota exceeded", 429);
        }
        await prisma.userEntitlement.update({
          where: { userId },
          data: { usedChatCountToday: { increment: amount } },
        });
      }
    }

    await prisma.usageEvent.create({
      data: { userId, type, amount },
    });

    return { ok: true, plan, unlimited: ent2.unlimited, stripeStatus: ent2.stripeStatus ?? null };
  });
}
