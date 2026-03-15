// app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { normalizePlan, planToFlags } from "@/lib/billing/planFlags";
import { getUsage } from "@/lib/billing/usage";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";
import { resolveEffectiveAccessFromEntitlement } from "@/lib/billing/access";
import { getStudyPlanLimits } from "@/lib/study/limits";
import {
  ensureRuntimeEntitlement,
  isLegacyUserEntitlementColumnError,
  runtimeEntitlementSelect,
} from "@/lib/billing/entitlementDb";
import { getChatPlanLimits, getHumanizerPlanLimits, getNotePlanLimits } from "@/lib/plans/productLimits";
import { getUserIdOrDev } from "@/lib/auth/devUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionWithUserId = { user?: { id?: string } } | null;

function daysLeftFromDate(dt?: Date | null) {
  if (!dt) return null;
  const ms = dt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function fallbackBillingStatus(userId: string) {
  const plan = normalizePlan("basic");
  const flags = planToFlags(plan);
  const studyLimits = getStudyPlanLimits(plan);
  const chatLimits = getChatPlanLimits(plan);
  const noteLimits = getNotePlanLimits(plan);
  const humanizerLimits = getHumanizerPlanLimits(plan);

  return NextResponse.json({
    ok: true,
    userId,
    plan,
    stripeStatus: null,
    daysLeft: null,
    entitled: true,
    source: "free",
    unlimited: false,
    unlimitedSource: null,
    promoAccessEndAt: null,
    developerBypass: false,
    detectorWordsPerWeek: flags.detectorWordsPerWeek,
    noteSecondsPerWeek: flags.noteSecondsPerWeek,
    chatPerDay: flags.chatPerDay,
    canSeeSuspiciousSentences: flags.canSeeSuspiciousSentences,
    usedDetectorWordsThisWeek: 0,
    usedNoteSecondsThisWeek: 0,
    usedHumanizerWordsThisWeek: 0,
    usedChatCountToday: 0,
    usedNoteGeneratesToday: 0,
    usedChatInputCharsWindow: 0,
    chatInputMaxChars: chatLimits.maxInputChars,
    chatBudgetCharsPerWindow: chatLimits.budgetCharsPerWindow,
    chatBudgetWindowHours: chatLimits.budgetWindowHours,
    chatCooldownMs: chatLimits.cooldownMs,
    noteGeneratesPerDay: noteLimits.generatesPerDay,
    noteInputMaxChars: noteLimits.maxInputChars,
    noteMaxItems: noteLimits.maxItems,
    noteCooldownMs: noteLimits.cooldownMs,
    humanizerWordsPerWeek: humanizerLimits.wordsPerWeek,
    humanizerMaxInputWords: humanizerLimits.maxInputWords,
    humanizerMinInputWords: humanizerLimits.minInputWords,
    humanizerCooldownMs: humanizerLimits.cooldownMs,
    studyGenerationsPerDay: studyLimits.generationsPerDay,
    studyMaxFileSizeBytes: studyLimits.maxFileSizeBytes,
    studyMaxExtractedChars: studyLimits.maxExtractedChars,
    studyMaxQuizQuestions: studyLimits.maxQuizQuestions,
    studyMaxSelectableModes: studyLimits.maxSelectableModes,
    studyAllowedDifficulties: studyLimits.allowedDifficulties,
    usedStudyCountToday: 0,
  });
}

function emptyUsageSnapshot() {
  return {
    usedDetectorWordsThisWeek: 0,
    usedNoteSecondsThisWeek: 0,
    usedHumanizerWordsThisWeek: 0,
    usedChatCountToday: 0,
    usedNoteGeneratesToday: 0,
    usedChatInputCharsWindow: 0,
    usedStudyCountToday: 0,
  };
}

async function updateEntitlementSnapshot(
  userId: string,
  data: Record<string, unknown>,
  fallback: typeof runtimeEntitlementSelect extends never ? never : any
) {
  try {
    return await prisma.userEntitlement.update({
      where: { userId },
      data,
      select: runtimeEntitlementSelect,
    });
  } catch (error) {
    if (!isLegacyUserEntitlementColumnError(error)) throw error;
    return {
      ...fallback,
      ...data,
    };
  }
}

export async function GET() {
  try {
    return await withPrismaConnectionRetry(
      async () => {
        const session = (await getServerSession(authOptions)) as SessionWithUserId;
        const userId = session?.user?.id ?? (await getUserIdOrDev());
        if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

        try {
          let ent = await ensureRuntimeEntitlement(prisma, userId);

          if (ent.stripeSubId) {
            try {
              const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
              const sub: any = (subResp as any).data ?? subResp;

              const stripeStatus = (sub?.status as string | undefined) ?? ent.stripeStatus ?? null;
              const currentPeriodEnd = sub?.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : ent.currentPeriodEnd ?? null;
              const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end ?? ent.cancelAtPeriodEnd ?? false);

              ent = await updateEntitlementSnapshot(
                userId,
                {
                  stripeStatus: stripeStatus ?? null,
                  currentPeriodEnd: currentPeriodEnd ?? undefined,
                  cancelAtPeriodEnd,
                },
                ent
              );

              if (!ent.unlimited && normalizePlan(ent.plan) !== "basic" && ent.stripeStatus !== "active") {
                const basicFlags = planToFlags("basic");
                ent = await updateEntitlementSnapshot(
                  userId,
                  {
                    ...basicFlags,
                    stripeStatus: ent.stripeStatus ?? "inactive",
                  },
                  ent
                );
              }
            } catch {
              if (!ent.unlimited) {
                const basicFlags = planToFlags("basic");
                ent = await updateEntitlementSnapshot(
                  userId,
                  {
                    ...basicFlags,
                    stripeSubId: null,
                    stripeStatus: "missing",
                    currentPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                  },
                  ent
                );
              } else {
                ent = await updateEntitlementSnapshot(
                  userId,
                  { stripeStatus: "missing", stripeSubId: null },
                  ent
                );
              }
            }
          }

          const access = resolveEffectiveAccessFromEntitlement(userId, ent);
          const plan = access.plan;
          const flags = access.flags;

          if (!access.unlimited && (plan === "basic" || plan === "pro" || plan === "ultra")) {
            const needSync =
              (ent.detectorWordsPerWeek ?? null) !== (flags.detectorWordsPerWeek ?? null) ||
              (ent.noteSecondsPerWeek ?? null) !== (flags.noteSecondsPerWeek ?? null) ||
              (ent.chatPerDay ?? null) !== (flags.chatPerDay ?? null) ||
              ent.canSeeSuspiciousSentences !== flags.canSeeSuspiciousSentences;

            if (needSync) {
              ent = await updateEntitlementSnapshot(
                userId,
                {
                  detectorWordsPerWeek: flags.detectorWordsPerWeek ?? null,
                  noteSecondsPerWeek: flags.noteSecondsPerWeek ?? null,
                  chatPerDay: flags.chatPerDay ?? null,
                  canSeeSuspiciousSentences: flags.canSeeSuspiciousSentences,
                },
                ent
              );
            }
          }

          const usage = await getUsage(userId).catch((error) => {
            console.error("[billing.status] usage read failed; defaulting usage counters", {
              userId,
              message: error instanceof Error ? error.message : String(error),
            });
            return emptyUsageSnapshot();
          });
          const entitled = access.entitled;
          const studyLimits = getStudyPlanLimits(plan);
          const chatLimits = getChatPlanLimits(plan);
          const noteLimits = getNotePlanLimits(plan);
          const humanizerLimits = getHumanizerPlanLimits(plan);
          const daysLeft =
            access.source === "promo"
              ? daysLeftFromDate(access.promoExpiresAt)
              : daysLeftFromDate(access.subscriptionExpiresAt ?? ent.currentPeriodEnd ?? null);

          console.log("[billing.status]", {
            userId,
            plan,
            source: access.source,
            stripeStatus: ent.stripeStatus,
            daysLeft,
            entitled,
            unlimited: access.unlimited,
            unlimitedSource: ent.unlimitedSource,
          });

          return NextResponse.json({
            ok: true,
            userId,
            plan,
            stripeStatus: ent.stripeStatus ?? null,
            daysLeft,
            entitled,
            source: access.source,
            unlimited: access.unlimited,
            unlimitedSource: ent.unlimitedSource ?? null,
            promoAccessEndAt: null,
            developerBypass: access.source === "developer_override",
            detectorWordsPerWeek: ent.detectorWordsPerWeek ?? flags.detectorWordsPerWeek ?? null,
            noteSecondsPerWeek: ent.noteSecondsPerWeek ?? flags.noteSecondsPerWeek ?? null,
            chatPerDay: ent.chatPerDay ?? flags.chatPerDay ?? null,
            canSeeSuspiciousSentences: ent.canSeeSuspiciousSentences ?? flags.canSeeSuspiciousSentences,
            usedDetectorWordsThisWeek: usage.usedDetectorWordsThisWeek,
            usedNoteSecondsThisWeek: usage.usedNoteSecondsThisWeek,
            usedHumanizerWordsThisWeek: usage.usedHumanizerWordsThisWeek,
            usedChatCountToday: usage.usedChatCountToday,
            usedNoteGeneratesToday: usage.usedNoteGeneratesToday,
            usedChatInputCharsWindow: usage.usedChatInputCharsWindow,
            chatInputMaxChars: chatLimits.maxInputChars,
            chatBudgetCharsPerWindow: chatLimits.budgetCharsPerWindow,
            chatBudgetWindowHours: chatLimits.budgetWindowHours,
            chatCooldownMs: chatLimits.cooldownMs,
            noteGeneratesPerDay: noteLimits.generatesPerDay,
            noteInputMaxChars: noteLimits.maxInputChars,
            noteMaxItems: noteLimits.maxItems,
            noteCooldownMs: noteLimits.cooldownMs,
            humanizerWordsPerWeek: humanizerLimits.wordsPerWeek,
            humanizerMaxInputWords: humanizerLimits.maxInputWords,
            humanizerMinInputWords: humanizerLimits.minInputWords,
            humanizerCooldownMs: humanizerLimits.cooldownMs,
            studyGenerationsPerDay: studyLimits.generationsPerDay,
            studyMaxFileSizeBytes: studyLimits.maxFileSizeBytes,
            studyMaxExtractedChars: studyLimits.maxExtractedChars,
            studyMaxQuizQuestions: studyLimits.maxQuizQuestions,
            studyMaxSelectableModes: studyLimits.maxSelectableModes,
            studyAllowedDifficulties: studyLimits.allowedDifficulties,
            usedStudyCountToday: usage.usedStudyCountToday,
          });
        } catch (error) {
          console.error("[billing.status] falling back to basic plan", {
            userId,
            message: error instanceof Error ? error.message : String(error),
          });
          return fallbackBillingStatus(userId);
        }
      },
      { maxRetries: 1, retryDelayMs: 120, operationName: "billing-status" }
    );
  } catch (error) {
    const session = (await getServerSession(authOptions)) as SessionWithUserId;
    const userId = session?.user?.id ?? (await getUserIdOrDev());
    if (userId) {
      console.error("[billing.status] outer fallback to basic plan", {
        userId,
        transient: isTransientPrismaConnectionError(error),
        message: error instanceof Error ? error.message : String(error),
      });
      return fallbackBillingStatus(userId);
    }

    if (isTransientPrismaConnectionError(error)) {
      return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "BILLING_STATUS_FAILED" }, { status: 500 });
  }
}
