import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function planFromPrice(priceId?: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ULTRA) return "ultra";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

export async function POST(req: Request) {
  const sig = (await headers()).get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json({ ok: false, error: "MISSING_WEBHOOK_SECRET" }, { status: 500 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  switch (event.type) {
    // ✅ 用户完成 checkout：保存 customerId / subscriptionId / plan
    case "checkout.session.completed": {
      const s = event.data.object as any;

      const userId = s?.metadata?.userId as string | undefined;
      const plan = s?.metadata?.plan as string | undefined;

      const customerId = (s?.customer as string | null) ?? null;
      const subscriptionId = (s?.subscription as string | null) ?? null;

      if (userId) {
        await prisma.userEntitlement.upsert({
          where: { userId },
          update: {
            plan: plan ?? "pro",
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            stripeStatus: "active",
          },
          create: {
            userId,
            plan: plan ?? "pro",
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            stripeStatus: "active",
          },
        });
      }
      break;
    }

    // ✅ 订阅状态变化：用 customerId 反查 UserEntitlement
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;

      const customerId = sub.customer as string | undefined;
      const subscriptionId = sub.id as string | undefined;
      const status = sub.status as string | undefined;

      // 订阅价格 -> plan（更精细：从 items[0].price.id 判断 pro/ultra）
      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const plan = status === "active" ? (planFromPrice(priceId) ?? "pro") : "basic";

      if (customerId) {
        await prisma.userEntitlement.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubId: subscriptionId ?? null,
            stripeStatus: status ?? null,
            plan,
          },
        });
      }
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
