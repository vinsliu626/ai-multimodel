import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function daysLeftFromUnix(unixSeconds?: number | null) {
  if (!unixSeconds) return null;
  const ms = unixSeconds * 1000 - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export async function getEntitlementStatus(userId: string) {
  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  // 默认取 DB
  let plan = ent.plan || "basic";
  let stripeStatus = ent.stripeStatus || null;
  let daysLeft: number | null = null;

  // 如果有订阅，就用 Stripe 的 current_period_end 算剩余天数，并同步状态
  if (ent.stripeSubId) {
    try {
      const subResp = await stripe.subscriptions.retrieve(ent.stripeSubId);
      const sub: any = (subResp as any).data ?? subResp;
      

      stripeStatus = sub.status;
      const currentPeriodEnd =
      (sub as any).current_period_end ??
      (sub as any).current_period_end_at ??
      null;

      daysLeft = daysLeftFromUnix(currentPeriodEnd);


      // 如果订阅已经不 active（比如 canceled/unpaid），你可以选择自动降级
      if (sub.status !== "active") {
        // 这里我给你更保守的逻辑：非 active 不立刻降级，只是标记状态
        // 你想要“到期就变 basic”，建议用 subscription.deleted + invoice.payment_failed 来控制
      }

      // 同步状态到 DB（可选但推荐）
      await prisma.userEntitlement.update({
        where: { userId },
        data: { stripeStatus: sub.status },
      });
    } catch (e) {
      // Stripe 查不到订阅（可能 test/live 混用或被删），可选择降级
      await prisma.userEntitlement.update({
        where: { userId },
        data: { plan: "basic", unlimited: false, stripeSubId: null, stripeStatus: "missing" },
      });
      plan = "basic";
      stripeStatus = "missing";
    }
  }

  // 你说的“打印用户xxx，Pro，20天”
  // 这里直接返回，前端显示即可
  return {
    ok: true,
    userId,
    plan,
    stripeStatus,
    daysLeft, // 可能为 null（例如 basic 或查不到订阅）
    unlimited: ent.unlimited,
  };
}
