import { prisma } from "@/lib/prisma";
import { startOfTodayUTC } from "@/lib/billing/time";
import { resolveEffectiveAccess } from "@/lib/billing/access";
import { getChatPlanLimits } from "@/lib/plans/productLimits";

const lastChatAtByUser = new Map<string, number>();
const chatBudgetWindowByUser = new Map<string, Array<{ at: number; chars: number }>>();

export class ChatLimitError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function pruneBudgetWindow(userId: string, windowHours: number) {
  const minTs = Date.now() - windowHours * 60 * 60 * 1000;
  const rows = (chatBudgetWindowByUser.get(userId) ?? []).filter((entry) => entry.at >= minTs);
  chatBudgetWindowByUser.set(userId, rows);
  return rows;
}

export async function getChatQuotaStatus(userId: string) {
  const { access } = await resolveEffectiveAccess(userId);
  const limits = getChatPlanLimits(access.plan);

  const usedTodayAgg = await prisma.usageEvent.aggregate({
    where: { userId, type: "chat_count", createdAt: { gte: startOfTodayUTC() } },
    _sum: { amount: true },
  });
  const windowRows = pruneBudgetWindow(userId, limits.budgetWindowHours);

  return {
    plan: access.plan,
    limits,
    usedToday: usedTodayAgg._sum.amount ?? 0,
    usedBudgetCharsInWindow: windowRows.reduce((sum, entry) => sum + entry.chars, 0),
  };
}

export async function assertChatRequestAllowed(userId: string, input: string) {
  const trimmed = input.trim();
  const { limits, usedToday, usedBudgetCharsInWindow } = await getChatQuotaStatus(userId);
  const now = Date.now();
  const last = lastChatAtByUser.get(userId) ?? 0;
  const inputChars = trimmed.length;

  if (inputChars > limits.maxInputChars) {
    throw new ChatLimitError("CHAT_INPUT_TOO_LARGE", "This message is too long for your current plan.", 400);
  }

  const cooldownRemainingMs = limits.cooldownMs - (now - last);
  if (cooldownRemainingMs > 0) {
    throw new ChatLimitError("CHAT_COOLDOWN_ACTIVE", "Please wait a moment before sending another request.", 429);
  }

  if (usedToday >= limits.messagesPerDay) {
    throw new ChatLimitError("CHAT_DAILY_LIMIT_REACHED", "You've reached your AI Chat limit for now. Please try again later.", 429);
  }

  if (usedBudgetCharsInWindow + inputChars > limits.budgetCharsPerWindow) {
    throw new ChatLimitError("CHAT_WINDOW_BUDGET_REACHED", "You've reached your AI Chat limit for now. Please try again later.", 429);
  }

  lastChatAtByUser.set(userId, now);
  const rows = pruneBudgetWindow(userId, limits.budgetWindowHours);
  rows.push({ at: now, chars: inputChars });
  chatBudgetWindowByUser.set(userId, rows);
  return { limits, inputChars };
}

export function markChatCooldown(userId: string) {
  lastChatAtByUser.set(userId, Date.now());
}
