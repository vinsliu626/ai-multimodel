import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

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
  developerBypass: true,
  promoPlan: true,
  promoAccessStartAt: true,
  promoAccessEndAt: true,
  promoAccessActive: true,
});

export type RuntimeUserEntitlement = {
  id: string;
  userId: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
  stripeCustomerId: string | null;
  stripeStatus: string | null;
  stripeSubId: string | null;
  canSeeSuspiciousSentences: boolean;
  chatPerDay: number | null;
  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  unlimited: boolean;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | null;
  dailyUsageKey: string | null;
  unlimitedSource: string | null;
  weeklyUsageKey: string | null;
  usedChatCountToday: number;
  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  developerBypass: boolean;
  promoPlan: string | null;
  promoAccessStartAt: Date | null;
  promoAccessEndAt: Date | null;
  promoAccessActive: boolean;
};

export const mutationResultSelect = Prisma.validator<Prisma.UserEntitlementSelect>()({
  id: true,
});

export function entitlementCreateData(userId: string): Prisma.UserEntitlementCreateInput {
  return { userId, plan: "basic" };
}

async function ensureMutationEntitlementLegacy(client: PrismaClient | Prisma.TransactionClient, userId: string) {
  const now = new Date();
  await client.$executeRaw`
    INSERT INTO "UserEntitlement" (
      "id",
      "userId",
      "plan",
      "createdAt",
      "updatedAt",
      "canSeeSuspiciousSentences",
      "chatPerDay",
      "detectorWordsPerWeek",
      "noteSecondsPerWeek",
      "unlimited",
      "cancelAtPeriodEnd",
      "usedChatCountToday",
      "usedDetectorWordsThisWeek",
      "usedNoteSecondsThisWeek"
    )
    VALUES (
      ${`legacy_${randomUUID()}`},
      ${userId},
      ${"basic"},
      ${now},
      ${now},
      ${false},
      ${10},
      ${5000},
      ${7200},
      ${false},
      ${false},
      ${0},
      ${0},
      ${0}
    )
    ON CONFLICT ("userId") DO NOTHING
  `;

  const rows = await client.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id"
    FROM "UserEntitlement"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return { id: String(rows[0]?.id ?? `legacy_${userId}`) };
}

export function isLegacyUserEntitlementColumnError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const column = String((error.meta as { column?: unknown } | undefined)?.column ?? "");
    if (column.includes("UserEntitlement.")) return true;
    return [
      "developerBypass",
      "developerBypassSetAt",
      "developerBypassNote",
      "promoPlan",
      "promoAccessStartAt",
      "promoAccessEndAt",
      "promoAccessActive",
    ].some((name) => column.includes(name));
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes("UserEntitlement") && message.includes("does not exist")) ||
    [
      "developerBypass",
      "developerBypassSetAt",
      "developerBypassNote",
      "promoPlan",
      "promoAccessStartAt",
      "promoAccessEndAt",
      "promoAccessActive",
    ].some((name) => message.includes(name) && message.includes("does not exist"))
  );
}

function toDateOrNull(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toNumberOrNull(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  return String(value).toLowerCase() === "true";
}

function fromLegacyRow(row: Record<string, unknown>, userId: string): RuntimeUserEntitlement {
  const now = new Date();
  return {
    id: String(row.id ?? `legacy_${userId}`),
    userId: String(row.userId ?? userId),
    plan: String(row.plan ?? "basic"),
    createdAt: toDateOrNull(row.createdAt) ?? now,
    updatedAt: toDateOrNull(row.updatedAt) ?? now,
    stripeCustomerId: row.stripeCustomerId == null ? null : String(row.stripeCustomerId),
    stripeStatus: row.stripeStatus == null ? null : String(row.stripeStatus),
    stripeSubId: row.stripeSubId == null ? null : String(row.stripeSubId),
    canSeeSuspiciousSentences: toBoolean(row.canSeeSuspiciousSentences),
    chatPerDay: toNumberOrNull(row.chatPerDay),
    detectorWordsPerWeek: toNumberOrNull(row.detectorWordsPerWeek),
    noteSecondsPerWeek: toNumberOrNull(row.noteSecondsPerWeek),
    unlimited: toBoolean(row.unlimited),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd == null ? null : toBoolean(row.cancelAtPeriodEnd),
    currentPeriodEnd: toDateOrNull(row.currentPeriodEnd),
    dailyUsageKey: row.dailyUsageKey == null ? null : String(row.dailyUsageKey),
    unlimitedSource: row.unlimitedSource == null ? null : String(row.unlimitedSource),
    weeklyUsageKey: row.weeklyUsageKey == null ? null : String(row.weeklyUsageKey),
    usedChatCountToday: Number(row.usedChatCountToday ?? 0),
    usedDetectorWordsThisWeek: Number(row.usedDetectorWordsThisWeek ?? 0),
    usedNoteSecondsThisWeek: Number(row.usedNoteSecondsThisWeek ?? 0),
    developerBypass: false,
    promoPlan: null,
    promoAccessStartAt: null,
    promoAccessEndAt: null,
    promoAccessActive: false,
  };
}

async function ensureRuntimeEntitlementLegacy(client: PrismaClient | Prisma.TransactionClient, userId: string) {
  const now = new Date();
  await client.$executeRaw`
    INSERT INTO "UserEntitlement" (
      "id",
      "userId",
      "plan",
      "createdAt",
      "updatedAt",
      "canSeeSuspiciousSentences",
      "chatPerDay",
      "detectorWordsPerWeek",
      "noteSecondsPerWeek",
      "unlimited",
      "cancelAtPeriodEnd",
      "usedChatCountToday",
      "usedDetectorWordsThisWeek",
      "usedNoteSecondsThisWeek"
    )
    VALUES (
      ${`legacy_${randomUUID()}`},
      ${userId},
      ${"basic"},
      ${now},
      ${now},
      ${false},
      ${10},
      ${5000},
      ${7200},
      ${false},
      ${false},
      ${0},
      ${0},
      ${0}
    )
    ON CONFLICT ("userId") DO NOTHING
  `;

  const rows = await client.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "id",
      "userId",
      "plan",
      "createdAt",
      "updatedAt",
      "stripeCustomerId",
      "stripeStatus",
      "stripeSubId",
      "canSeeSuspiciousSentences",
      "chatPerDay",
      "detectorWordsPerWeek",
      "noteSecondsPerWeek",
      "unlimited",
      "cancelAtPeriodEnd",
      "currentPeriodEnd",
      "dailyUsageKey",
      "unlimitedSource",
      "weeklyUsageKey",
      "usedChatCountToday",
      "usedDetectorWordsThisWeek",
      "usedNoteSecondsThisWeek"
    FROM "UserEntitlement"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return fromLegacyRow(rows[0] ?? {}, userId);
}

export async function ensureRuntimeEntitlement(client: PrismaClient | Prisma.TransactionClient, userId: string) {
  try {
    return await client.userEntitlement.upsert({
      where: { userId },
      update: {},
      create: entitlementCreateData(userId),
      select: runtimeEntitlementSelect,
    });
  } catch (error) {
    if (!isLegacyUserEntitlementColumnError(error)) throw error;
    return ensureRuntimeEntitlementLegacy(client, userId);
  }
}

export async function ensureMutationEntitlement(client: PrismaClient | Prisma.TransactionClient, userId: string) {
  try {
    return await client.userEntitlement.upsert({
      where: { userId },
      update: {},
      create: entitlementCreateData(userId),
      select: mutationResultSelect,
    });
  } catch (error) {
    if (!isLegacyUserEntitlementColumnError(error)) throw error;
    return ensureMutationEntitlementLegacy(client, userId);
  }
}
