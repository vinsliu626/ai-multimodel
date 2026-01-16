// app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function daysLeftFromUnix(unixSeconds?: number | null) {
  if (!unixSeconds) return null;
  const ms = unixSeconds * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function isEntitled(plan: string, stripeStatus: string | null, daysLeft: number | null) {
  // basic 永远可用基础功能
  if (plan === "basic") return true;

  // 订阅制：只允许 active（你也可以做宽限期，比如 past_due 允许 3 天）
  if (stripeStatus !== "active") return false;

  // 有天数信息的话，再兜底判断一下
  if (daysLeft !== null && daysLeft <= 0) return false;

  return true;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;

  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  // 没有记录就创建一条 basic
  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  let plan = ent.plan ?? "basic";
  let stripeStatus: string | null = ent.stripeStatus ?? null;
  let daysLeft: number | null = null;

  // 如果有订阅，去 Stripe 拿真实状态与周期结束时间
  if (ent.stripeSubId) {
    try {
      const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
      const sub: any = (subResp as any).data ?? subResp; // 兼容 Response<Subscription>

      stripeStatus = sub.status ?? stripeStatus;

      const currentPeriodEnd =
        sub.current_period_end ?? sub.current_period_end_at ?? null;

      daysLeft = daysLeftFromUnix(currentPeriodEnd);

      // 同步状态到 DB（可选但推荐）
      await prisma.userEntitlement.update({
        where: { userId },
        data: { stripeStatus: stripeStatus ?? null },
      });

      // ✅ 你要“没续费不能继续用”：这里直接把非 active 的用户降回 basic
      // （如果你想给宽限期，就不要立刻降级，而是根据 daysLeft/时间判断）
      
    } catch (e) {
      // Stripe 查不到订阅（test/live 混用、订阅被删等）：降级
      plan = "basic";
      stripeStatus = "missing";
      daysLeft = null;

      await prisma.userEntitlement.update({
        where: { userId },
        data: { plan: "basic", unlimited: false, stripeSubId: null, stripeStatus: "missing" },
      });
    }
  }

  const entitled = isEntitled(plan, stripeStatus, daysLeft);

  // ✅ 你要“打印用户数据”：这里就是服务端日志（Vercel/本地都能看到）
  console.log("[billing.status]", { userId, plan, stripeStatus, daysLeft, entitled });

  // 返回给前端显示
  return NextResponse.json({
    ok: true,
    userId,
    plan,
    stripeStatus,
    daysLeft,
    entitled,

    unlimited: ent.unlimited ?? false,

    detectorWordsPerWeek: ent.detectorWordsPerWeek ?? 5000,
    noteSecondsPerWeek: ent.noteSecondsPerWeek ?? 2 * 3600,
    chatPerDay: ent.chatPerDay ?? 10,

    usedDetectorWordsThisWeek: ent.usedDetectorWordsThisWeek ?? 0,
    usedNoteSecondsThisWeek: ent.usedNoteSecondsThisWeek ?? 0,
    usedChatCountToday: ent.usedChatCountToday ?? 0,

    canSeeSuspiciousSentences: ent.canSeeSuspiciousSentences ?? false,
  });
}
