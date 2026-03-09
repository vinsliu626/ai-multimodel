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
    usedChatCountToday: 0,
    studyGenerationsPerDay: studyLimits.generationsPerDay,
    studyMaxFileSizeBytes: studyLimits.maxFileSizeBytes,
    studyMaxExtractedChars: studyLimits.maxExtractedChars,
    studyMaxQuizQuestions: studyLimits.maxQuizQuestions,
    studyMaxSelectableModes: studyLimits.maxSelectableModes,
    studyAllowedDifficulties: studyLimits.allowedDifficulties,
    usedStudyCountToday: 0,
  });
}

export async function GET() {
  try {
    return await withPrismaConnectionRetry(
      async () => {
        const session = (await getServerSession(authOptions)) as SessionWithUserId;
        const userId = session?.user?.id;
        if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

        try {
          let ent = await prisma.userEntitlement.upsert({
            where: { userId },
            update: {},
            create: { userId, plan: "basic" },
          });

          if (ent.stripeSubId) {
            try {
              const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
              const sub: any = (subResp as any).data ?? subResp;

              const stripeStatus = (sub?.status as string | undefined) ?? ent.stripeStatus ?? null;
              const currentPeriodEnd = sub?.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : ent.currentPeriodEnd ?? null;
              const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end ?? ent.cancelAtPeriodEnd ?? false);

              ent = await prisma.userEntitlement.update({
                where: { userId },
                data: {
                  stripeStatus: stripeStatus ?? null,
                  currentPeriodEnd: currentPeriodEnd ?? undefined,
                  cancelAtPeriodEnd,
                },
              });

              if (!ent.unlimited && normalizePlan(ent.plan) !== "basic" && ent.stripeStatus !== "active") {
                const basicFlags = planToFlags("basic");
                ent = await prisma.userEntitlement.update({
                  where: { userId },
                  data: {
                    ...basicFlags,
                    stripeStatus: ent.stripeStatus ?? "inactive",
                  },
                });
              }
            } catch {
              if (!ent.unlimited) {
                const basicFlags = planToFlags("basic");
                ent = await prisma.userEntitlement.update({
                  where: { userId },
                  data: {
                    ...basicFlags,
                    stripeSubId: null,
                    stripeStatus: "missing",
                    currentPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                  },
                });
              } else {
                ent = await prisma.userEntitlement.update({
                  where: { userId },
                  data: { stripeStatus: "missing", stripeSubId: null },
                });
              }
            }
          }

          if (ent.promoAccessActive && ent.promoAccessEndAt && ent.promoAccessEndAt.getTime() <= Date.now()) {
            ent = await prisma.userEntitlement.update({
              where: { userId },
              data: { promoAccessActive: false },
            });
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
              ent = await prisma.userEntitlement.update({
                where: { userId },
                data: {
                  detectorWordsPerWeek: flags.detectorWordsPerWeek ?? null,
                  noteSecondsPerWeek: flags.noteSecondsPerWeek ?? null,
                  chatPerDay: flags.chatPerDay ?? null,
                  canSeeSuspiciousSentences: flags.canSeeSuspiciousSentences,
                },
              });
            }
          }

          const usage = await getUsage(userId);
          const entitled = access.entitled;
          const studyLimits = getStudyPlanLimits(plan);
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
            unlimitedSource: access.source === "promo" ? "promo" : ent.unlimitedSource ?? null,
            promoAccessEndAt: ent.promoAccessEndAt ?? null,
            developerBypass: access.source === "developer_override",
            detectorWordsPerWeek: ent.detectorWordsPerWeek ?? flags.detectorWordsPerWeek ?? null,
            noteSecondsPerWeek: ent.noteSecondsPerWeek ?? flags.noteSecondsPerWeek ?? null,
            chatPerDay: ent.chatPerDay ?? flags.chatPerDay ?? null,
            canSeeSuspiciousSentences: ent.canSeeSuspiciousSentences ?? flags.canSeeSuspiciousSentences,
            usedDetectorWordsThisWeek: usage.usedDetectorWordsThisWeek,
            usedNoteSecondsThisWeek: usage.usedNoteSecondsThisWeek,
            usedChatCountToday: usage.usedChatCountToday,
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
    const userId = session?.user?.id;
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
