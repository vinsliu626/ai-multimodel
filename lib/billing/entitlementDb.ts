import { Prisma, type PrismaClient } from "@prisma/client";

export const runtimeEntitlementSelect = Prisma.validator<Prisma.UserEntitlementSelect>()({
  id: true,
  userId: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
  stripeCustomerId: true,
  stripeStatus: true,
  stripeSubId: true,
  canSeeSuspiciousSentences: true,
  chatPerDay: true,
  detectorWordsPerWeek: true,
  noteSecondsPerWeek: true,
  unlimited: true,
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  dailyUsageKey: true,
  unlimitedSource: true,
  weeklyUsageKey: true,
  usedChatCountToday: true,
  usedDetectorWordsThisWeek: true,
  usedNoteSecondsThisWeek: true,
});

export type RuntimeUserEntitlement = Prisma.UserEntitlementGetPayload<{
  select: typeof runtimeEntitlementSelect;
}>;

export const mutationResultSelect = Prisma.validator<Prisma.UserEntitlementSelect>()({
  id: true,
});

export function entitlementCreateData(userId: string): Prisma.UserEntitlementCreateInput {
  return { userId, plan: "basic" };
}

export async function ensureRuntimeEntitlement(client: PrismaClient | Prisma.TransactionClient, userId: string) {
  return client.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: entitlementCreateData(userId),
    select: runtimeEntitlementSelect,
  });
}
