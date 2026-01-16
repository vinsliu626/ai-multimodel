// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function planToFlags(plan: string) {
  const p = plan === "ultra" ? "ultra" : plan === "pro" ? "pro" : "basic";
  return {
    plan: p,
    unlimited: false,
    canSeeSuspiciousSentences: p !== "basic",
    // 你也可以在这里设置额度
    detectorWordsPerWeek: p === "basic" ? 5000 : p === "pro" ? 15000 : null,
    noteSecondsPerWeek: p === "basic" ? 2 * 3600 : p === "pro" ? 15 * 3600 : null,
    chatPerDay: p === "basic" ? 10 : null,
  };
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature"); // ✅ 不要 await
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json({ ok: false, error: "MISSING_WEBHOOK_SECRET" }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_SIGNATURE", message: e?.message || String(e) },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as any;

        const userId = (s?.metadata?.userId as string | undefined) || undefined;
        const plan = (s?.metadata?.plan as string | undefined) || "pro";
        const customerId = (s?.customer as string | null) ?? null;
        const subscriptionId = (s?.subscription as string | null) ?? null;

        if (userId) {
          const flags = planToFlags(plan);
          await prisma.userEntitlement.upsert({
            where: { userId },
            update: {
              ...flags,
              stripeCustomerId: customerId,
              stripeSubId: subscriptionId,
              stripeStatus: "active",
            },
            create: {
              userId,
              ...flags,
              stripeCustomerId: customerId,
              stripeSubId: subscriptionId,
              stripeStatus: "active",
            },
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const customerId = sub.customer as string | undefined;
        const status = sub.status as string | undefined;
        const subscriptionId = sub.id as string | undefined;

        if (!customerId) break;

        const ent = await prisma.userEntitlement.findFirst({
          where: { stripeCustomerId: customerId },
          select: { userId: true },
        });
        if (!ent?.userId) break;

        // plan：优先从 subscription.metadata 取（因为你 checkout 时写入了 subscription_data.metadata）
        const planFromMeta = (sub?.metadata?.plan as string | undefined) || undefined;

        if (status === "active") {
          const flags = planToFlags(planFromMeta || "pro");
          await prisma.userEntitlement.update({
            where: { userId: ent.userId },
            data: {
              ...flags,
              stripeSubId: subscriptionId ?? null,
              stripeStatus: status ?? null,
            },
          });
        } else {
          // 非 active：回 basic（你可按需求改成 past_due 仍保留权限等）
          const flags = planToFlags("basic");
          await prisma.userEntitlement.update({
            where: { userId: ent.userId },
            data: {
              ...flags,
              stripeSubId: subscriptionId ?? null,
              stripeStatus: status ?? null,
            },
          });
        }
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // webhook 必须返回 2xx 否则 stripe 会重试
    return NextResponse.json(
      { ok: false, error: "WEBHOOK_HANDLER_FAILED", message: e?.message || String(e) },
      { status: 200 }
    );
  }
}
