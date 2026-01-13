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

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  switch (event.type) {
    // ✅ 用户完成 checkout：保存 customerId / subscriptionId / plan
    case "checkout.session.completed": {
      const session = event.data.object as any;

      const userId = session?.metadata?.userId as string | undefined;
      const plan = session?.metadata?.plan as string | undefined;

      const subscriptionId = (session?.subscription as string | null) ?? null;
      const customerId = (session?.customer as string | null) ?? null;

      if (userId) {
        await prisma.userEntitlement.upsert({
          where: { userId },
          update: {
            plan: plan ?? "pro",
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            stripeStatus: "active",
            unlimited: false,
          },
          create: {
            userId,
            plan: plan ?? "pro",
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            stripeStatus: "active",
            unlimited: false,
          },
        });
      }
      break;
    }

    // ✅ 订阅状态变化：用 customerId 反查 UserEntitlement（不需要 stripeCustomer 表）
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;

      const customerId = (sub?.customer as string | undefined) ?? undefined;
      const status = (sub?.status as string | undefined) ?? undefined;
      const subscriptionId = (sub?.id as string | undefined) ?? undefined;

      if (customerId) {
        const ent = await prisma.userEntitlement.findFirst({
          where: { stripeCustomerId: customerId },
          select: { userId: true },
        });

        if (ent?.userId) {
          await prisma.userEntitlement.update({
            where: { userId: ent.userId },
            data: {
              stripeSubId: subscriptionId ?? null,
              stripeStatus: status ?? null,
              plan: status === "active" ? "pro" : "basic",
            },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
