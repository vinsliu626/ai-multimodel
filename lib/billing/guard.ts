// lib/billing/guard.ts
import { prisma } from "@/lib/prisma";

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

// 你可以按需求改配额：
// - chat：按 次/天
// - detector：按 词/天
// - note：按 秒/天
const DAILY_LIMITS: Record<
  "basic" | "pro" | "ultra",
  { chat: number; detector_words: number; note_seconds: number }
> = {
  basic: { chat: 10, detector_words: 1500, note_seconds: 10 * 60 }, // 10分钟
  pro: { chat: 999999, detector_words: 999999, note_seconds: 999999 }, // 你也可以设成更合理的值
  ultra: { chat: 999999, detector_words: 999999, note_seconds: 999999 },
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapActionToUsageType(action: QuotaAction) {
  if (action === "chat") return "chat_count";
  if (action === "detector") return "detector_words";
  return "note_seconds";
}

export async function assertQuotaOrThrow(input: {
  userId: string;
  action: QuotaAction;
  amount: number;
}) {
  const { userId, action } = input;
  const amount = Math.max(1, Math.floor(input.amount || 1));

  // 1) 读用户权益（没有就当 basic）
  const ent =
    (await prisma.userEntitlement.findUnique({ where: { userId } })) ??
    null;

  const plan = (ent?.plan as "basic" | "pro" | "ultra") || "basic";
  const giftUnlimited = Boolean(ent?.giftUnlimited);

  // 2) pro/ultra 或 giftUnlimited：直接放行
  if (giftUnlimited || plan === "pro" || plan === "ultra") return;

  // 3) 今日已用量
  const usageType = mapActionToUsageType(action);
  const since = startOfToday();

  const agg = await prisma.usageEvent.aggregate({
    where: {
      userId,
      type: usageType,
      createdAt: { gte: since },
    },
    _sum: { amount: true },
  });

  const used = agg._sum.amount ?? 0;

  // 4) 当日上限
  const limit = DAILY_LIMITS[plan][usageType as keyof (typeof DAILY_LIMITS)["basic"]] ?? 0;

  if (used + amount > limit) {
    // 给前端更好显示
    const remain = Math.max(0, limit - used);
    const code =
      usageType === "chat_count"
        ? "CHAT_QUOTA_EXCEEDED"
        : usageType === "detector_words"
          ? "DETECTOR_QUOTA_EXCEEDED"
          : "NOTE_QUOTA_EXCEEDED";

    throw new QuotaError(
      code,
      `Quota exceeded: ${usageType}. used=${used}, limit=${limit}, remaining=${remain}`,
      429
    );
  }
}
