// app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { normalizePlan, planToFlags } from "@/lib/billing/planFlags";
import { getUsage } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function daysLeftFromDate(dt?: Date | null) {
  if (!dt) return null;
  const ms = dt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function isEntitled(ent: {
  plan: string;
  stripeStatus: string | null;
  currentPeriodEnd?: Date | null;
  unlimited?: boolean;
}) {
  if (ent.unlimited) return true;
  const plan = normalizePlan(ent.plan);

  if (plan === "basic") return true;

  // 严格：必须 active
  if (ent.stripeStatus !== "active") return false;

  // 有 period end 则兜底判断
  if (ent.currentPeriodEnd) {
    if (ent.currentPeriodEnd.getTime() <= Date.now()) return false;
  }

  return true;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  // 1) 保证 entitlement 存在
  let ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId, plan: "basic" },
  });

  // 2) 同步 Stripe（可选但推荐）
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

      // 严格：非 active 自动降 basic（但不动 unlimited）
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
    } catch (e) {
      // Stripe 查不到订阅：降级 basic（不动 unlimited）
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

  // 3) 计算 plan + flags
  const plan = normalizePlan(ent.plan);
  const flags = planToFlags(plan);

  // 4) ✅ 自动对齐：防止数据库残留旧额度
  if (!ent.unlimited && (plan === "basic" || plan === "pro" || plan === "ultra")) {
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

  // 5) ✅ usage 统一从 UsageEvent 聚合拿（这是你 guard 实际用的口径）
  const usage = await getUsage(userId);

  const entitled = isEntitled({
    plan,
    stripeStatus: ent.stripeStatus ?? null,
    currentPeriodEnd: ent.currentPeriodEnd ?? null,
    unlimited: ent.unlimited ?? false,
  });

  const daysLeft = daysLeftFromDate(ent.currentPeriodEnd ?? null);

  console.log("[billing.status]", {
    userId,
    plan,
    stripeStatus: ent.stripeStatus,
    daysLeft,
    entitled,
    unlimited: ent.unlimited,
    unlimitedSource: ent.unlimitedSource,
  });

  return NextResponse.json({
    ok: true,
    userId,
    plan,
    stripeStatus: ent.stripeStatus ?? null,
    daysLeft,
    entitled,

    unlimited: ent.unlimited ?? false,
    unlimitedSource: ent.unlimitedSource ?? null,

    // ✅ 返回“实际生效值”：DB 优先，其次 flags
    detectorWordsPerWeek: ent.detectorWordsPerWeek ?? flags.detectorWordsPerWeek ?? null,
    noteSecondsPerWeek: ent.noteSecondsPerWeek ?? flags.noteSecondsPerWeek ?? null,
    chatPerDay: ent.chatPerDay ?? flags.chatPerDay ?? null,
    canSeeSuspiciousSentences: ent.canSeeSuspiciousSentences ?? flags.canSeeSuspiciousSentences,

    // ✅ 返回聚合 usage（正确口径）
    usedDetectorWordsThisWeek: usage.usedDetectorWordsThisWeek,
    usedNoteSecondsThisWeek: usage.usedNoteSecondsThisWeek,
    usedChatCountToday: usage.usedChatCountToday,
  });
}