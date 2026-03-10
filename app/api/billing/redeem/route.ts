// app/api/billing/redeem/route.ts
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPromoCode, normalizePromoCode } from "@/lib/promo/codeHash";
import { redeemPromoCodeTx } from "@/lib/promo/service";
import { planToFlags } from "@/lib/billing/planFlags";
import { mutationResultSelect } from "@/lib/billing/entitlementDb";
import { resolveGiftCampaignPolicy } from "@/lib/billing/giftCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeRequestId(req: Request): string {
  const headerId = req.headers.get("x-request-id")?.trim();
  if (headerId) return headerId.slice(0, 128);
  return randomUUID();
}

function resolveUserId(sessionUserId: string | undefined, req: Request): string | undefined {
  if (sessionUserId) return sessionUserId;
  if (process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "true") {
    const headerUserId = req.headers.get("x-dev-user-id")?.trim();
    if (headerUserId) return headerUserId.slice(0, 128);
    const envUser = process.env.DEV_USER_EMAIL?.trim();
    if (envUser) return envUser.slice(0, 128);
    return "dev_user";
  }
  return undefined;
}

function isPromoTableMissingError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    const table = String((error.meta as { table?: unknown } | undefined)?.table ?? "");
    if (table.includes("PromoCode") || table.includes("PromoRedemption")) return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PromoCode") && message.includes("does not exist");
}

function resolveNow(req: Request): Date {
  if (process.env.NODE_ENV !== "production") {
    const devNow = req.headers.get("x-dev-now")?.trim();
    if (devNow) {
      const parsed = new Date(devNow);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}

async function supportsPromoEntitlementColumns(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'UserEntitlement'
      AND column_name IN ('promoPlan', 'promoAccessStartAt', 'promoAccessEndAt', 'promoAccessActive', 'developerBypass')
  `;
  const columns = new Set(rows.map((row) => row.column_name));
  return (
    columns.has("promoPlan") &&
    columns.has("promoAccessStartAt") &&
    columns.has("promoAccessEndAt") &&
    columns.has("promoAccessActive") &&
    columns.has("developerBypass")
  );
}

async function writeLegacyGiftEntitlement(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    plan: "pro" | "ultra";
    grantEndAt: Date;
    canSeeSuspiciousSentences: boolean;
    chatPerDay: number | null;
    detectorWordsPerWeek: number | null;
    noteSecondsPerWeek: number | null;
  }
) {
  const now = new Date();
  await tx.$executeRaw`
    INSERT INTO "UserEntitlement" (
      "id",
      "userId",
      "plan",
      "createdAt",
      "updatedAt",
      "stripeStatus",
      "stripeSubId",
      "currentPeriodEnd",
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
      ${randomUUID()},
      ${input.userId},
      ${input.plan},
      ${now},
      ${now},
      ${"gift"},
      ${null},
      ${input.grantEndAt},
      ${input.canSeeSuspiciousSentences},
      ${input.chatPerDay},
      ${input.detectorWordsPerWeek},
      ${input.noteSecondsPerWeek},
      ${false},
      ${false},
      ${0},
      ${0},
      ${0}
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "plan" = EXCLUDED."plan",
      "updatedAt" = EXCLUDED."updatedAt",
      "stripeStatus" = EXCLUDED."stripeStatus",
      "stripeSubId" = EXCLUDED."stripeSubId",
      "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
      "canSeeSuspiciousSentences" = EXCLUDED."canSeeSuspiciousSentences",
      "chatPerDay" = EXCLUDED."chatPerDay",
      "detectorWordsPerWeek" = EXCLUDED."detectorWordsPerWeek",
      "noteSecondsPerWeek" = EXCLUDED."noteSecondsPerWeek",
      "unlimited" = EXCLUDED."unlimited",
      "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd"
  `;
}

async function redeemWithGiftTables(input: { userId: string; normalizedCode: string; requestId: string; now: Date }) {
  const { userId, normalizedCode, requestId, now } = input;
  const policy = resolveGiftCampaignPolicy(normalizedCode);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gift:${normalizedCode}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gift-user:${normalizedCode}:${userId}`}))`;

    const gift = await tx.giftCode.findUnique({ where: { code: normalizedCode } });
    if (!gift) return { ok: false as const, error: "INVALID_CODE" as const };
    if (!gift.isActive) return { ok: false as const, error: "INACTIVE_CODE" as const };
    if (policy.codeExpiresAt.getTime() <= now.getTime()) return { ok: false as const, error: "CODE_EXPIRED" as const };
    if (gift.maxUses !== null && gift.usedCount >= gift.maxUses) {
      return { ok: false as const, error: "CODE_EXHAUSTED" as const };
    }

    const redeemed = await tx.giftCodeRedemption.findFirst({
      where: { code: normalizedCode, userId },
      select: { id: true },
    });
    if (redeemed) return { ok: false as const, error: "PER_USER_LIMIT_REACHED" as const };

    await tx.giftCodeRedemption.create({
      data: { code: normalizedCode, userId },
    });
    await tx.giftCode.update({
      where: { code: normalizedCode },
      data: { usedCount: { increment: 1 } },
    });

    const proFlags = planToFlags(policy.plan);
    const grantEndAt = new Date(now.getTime() + policy.grantDurationDays * 24 * 60 * 60 * 1000);
    const entitlementSupportsPromoColumns = await supportsPromoEntitlementColumns(tx);
    if (entitlementSupportsPromoColumns) {
      await tx.userEntitlement.upsert({
        where: { userId },
        update: {
          ...proFlags,
          promoPlan: policy.plan,
          promoAccessStartAt: now,
          promoAccessEndAt: grantEndAt,
          promoAccessActive: true,
        },
        create: {
          userId,
          ...proFlags,
          promoPlan: policy.plan,
          promoAccessStartAt: now,
          promoAccessEndAt: grantEndAt,
          promoAccessActive: true,
        },
        select: mutationResultSelect,
      });
    } else {
      const legacyPlan = policy.plan;
      const legacyFlags = planToFlags(legacyPlan);
      await writeLegacyGiftEntitlement(tx, {
        userId,
        plan: legacyPlan,
        grantEndAt,
        canSeeSuspiciousSentences: legacyFlags.canSeeSuspiciousSentences,
        chatPerDay: legacyFlags.chatPerDay,
        detectorWordsPerWeek: legacyFlags.detectorWordsPerWeek,
        noteSecondsPerWeek: legacyFlags.noteSecondsPerWeek,
      });
    }

    return {
      ok: true as const,
      plan: policy.plan,
      grantEndAt,
      source: "gift" as const,
      requestId,
    };
  });

  return result;
}

export async function POST(req: Request) {
  const requestId = makeRequestId(req);
  const now = resolveNow(req);
  const session = await getServerSession(authOptions);
  const userId = resolveUserId((session as any)?.user?.id as string | undefined, req);
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rawCode = String(body?.code || "");
  const normalizedCode = normalizePromoCode(rawCode);
  if (!normalizedCode) return NextResponse.json({ ok: false, error: "MISSING_CODE", requestId }, { status: 400 });

  try {
    const codeHash = hashPromoCode(normalizedCode);
    let result:
      | { ok: false; error: "INVALID_CODE" | "INACTIVE_CODE" | "NOT_STARTED" | "CODE_EXPIRED" | "CODE_EXHAUSTED" | "PER_USER_LIMIT_REACHED" | "INVALID_GRANT_WINDOW" }
      | { ok: true; plan: string; grantEndAt: Date | null; source: string };

    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo:${codeHash}`}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo-user:${codeHash}:${userId}`}))`;

        const promo = await tx.promoCode.findUnique({ where: { codeHash } });
        if (!promo) return { ok: false as const, error: "INVALID_CODE" as const };

        return redeemPromoCodeTx(tx, userId, promo, now);
      });
    } catch (error) {
      if (!isPromoTableMissingError(error)) throw error;
      console.warn("[billing.redeem] promo tables missing; falling back to GiftCode", { requestId, userId });
      result = await redeemWithGiftTables({ userId, normalizedCode, requestId, now });
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, requestId }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      plan: result.plan,
      grantEndAt: result.grantEndAt,
      source: result.source,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason =
      message === "PROMO_CONFIG_MISSING_SECRET" || message === "PROMO_CONFIG_INVALID_SECRET"
        ? message
        : "REDEEM_RUNTIME_ERROR";
    console.error("[billing.redeem] failed", { requestId, userId, reason });

    if (message === "PROMO_CONFIG_MISSING_SECRET") {
      return NextResponse.json(
        {
          ok: false,
          error: "PROMO_CONFIG_MISSING_SECRET",
          message: "Server promo config is missing. Set PROMO_CODE_SECRET.",
          requestId,
        },
        { status: 500 }
      );
    }
    if (message === "PROMO_CONFIG_INVALID_SECRET") {
      return NextResponse.json(
        {
          ok: false,
          error: "PROMO_CONFIG_INVALID_SECRET",
          message: "Server promo config is invalid. Replace PROMO_CODE_SECRET with a non-placeholder secret.",
          requestId,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: "REDEEM_FAILED", requestId }, { status: 500 });
  }
}
