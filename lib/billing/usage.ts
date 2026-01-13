// lib/billing/usage.ts
import { prisma } from "@/lib/prisma";
import { startOfThisWeekUTC, startOfTodayUTC } from "./time";
import type { UsageType } from "./constants";

export async function getUsage(userId: string) {
  const weekStart = startOfThisWeekUTC();
  const dayStart = startOfTodayUTC();

  const [weekDetector, weekNote, dayChat] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { userId, type: "detector_words", createdAt: { gte: weekStart } },
      _sum: { amount: true },
    }),
    prisma.usageEvent.aggregate({
      where: { userId, type: "note_seconds", createdAt: { gte: weekStart } },
      _sum: { amount: true },
    }),
    prisma.usageEvent.aggregate({
      where: { userId, type: "chat_count", createdAt: { gte: dayStart } },
      _sum: { amount: true },
    }),
  ]);

  return {
    usedDetectorWordsThisWeek: weekDetector._sum.amount ?? 0,
    usedNoteSecondsThisWeek: weekNote._sum.amount ?? 0,
    usedChatCountToday: dayChat._sum.amount ?? 0,
  };
}

export async function addUsageEvent(userId: string, type: UsageType, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await prisma.usageEvent.create({
    data: { userId, type, amount: Math.floor(amount) },
  });
}
