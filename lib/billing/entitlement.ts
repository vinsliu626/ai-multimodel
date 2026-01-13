// lib/billing/entitlement.ts
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanId } from "./constants";
import { getUsage } from "./usage";

export type EntitlementStatus = {
  ok: true;
  plan: "basic" | "pro" | "ultra" | "gift";
  unlimited: boolean;

  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;

  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedChatCountToday: number;

  canSeeSuspiciousSentences: boolean;
};

export async function ensureUserEntitlementRow(userId: string) {
  // create if not exists
  await prisma.userEntitlement.upsert({
    where: { userId },
    create: { userId, plan: "basic", unlimited: false },
    update: {},
  });
}

export async function getEntitlementStatus(userId: string): Promise<EntitlementStatus> {
  await ensureUserEntitlementRow(userId);

  const ent = await prisma.userEntitlement.findUnique({ where: { userId } });
  const usage = await getUsage(userId);

  const plan = (ent?.plan as PlanId) || "basic";
  const giftUnlimited = !!ent?.unlimited;

  if (giftUnlimited) {
    return {
      ok: true,
      plan: "gift",
      unlimited: true,
      detectorWordsPerWeek: null,
      noteSecondsPerWeek: null,
      chatPerDay: null,
      ...usage,
      canSeeSuspiciousSentences: true,
    };
  }

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;

  const unlimited =
    limits.detectorWordsPerWeek === null &&
    limits.noteSecondsPerWeek === null &&
    limits.chatPerDay === null;

  return {
    ok: true,
    plan,
    unlimited,
    detectorWordsPerWeek: limits.detectorWordsPerWeek,
    noteSecondsPerWeek: limits.noteSecondsPerWeek,
    chatPerDay: limits.chatPerDay,
    ...usage,
    canSeeSuspiciousSentences: limits.canSeeSuspiciousSentences,
  };
}
