// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  // 只处理你关心的事件：订阅创建/更新/取消
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as any;
      const userId = session?.metadata?.userId as string | undefined;
      const plan = session?.metadata?.plan as string | undefined;
      const subscriptionId = session?.subscription as string | undefined;

      if (userId && plan) {
        await prisma.userEntitlement.upsert({
          where: { userId },
          update: {
            plan,
            stripeSubId: subscriptionId ?? null,
            stripeStatus: "active",
            giftUnlimited: false, // 付费不等于 gift，但你可以按自己逻辑改
          },
          create: {
            userId,
            plan,
            stripeSubId: subscriptionId ?? null,
            stripeStatus: "active",
            giftUnlimited: false,
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const customerId = sub.customer as string;
      const status = sub.status as string;
      const subscriptionId = sub.id as string;

      const row = await prisma.stripeCustomer.findFirst({ where: { customerId } });
      if (row?.userId) {
        await prisma.userEntitlement.upsert({
          where: { userId: row.userId },
          update: {
            stripeSubId: subscriptionId,
            stripeStatus: status,
            plan: status === "active" ? "pro" : "basic", // 这里你可以更精细：根据 price 判断 pro/ultra
          },
          create: {
            userId: row.userId,
            plan: status === "active" ? "pro" : "basic",
            stripeSubId: subscriptionId,
            stripeStatus: status,
          },
        });
      }
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
