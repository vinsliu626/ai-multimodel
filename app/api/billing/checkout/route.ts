import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan as "pro" | "ultra";

  const priceId =
    plan === "ultra" ? process.env.STRIPE_PRICE_ULTRA : process.env.STRIPE_PRICE_PRO;

  if (!priceId) {
    return NextResponse.json({ ok: false, error: "MISSING_PRICE_ID" }, { status: 500 });
  }

  // 1) 找/建 UserEntitlement
  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  // 2) 找/建 Stripe customerId（存到 UserEntitlement.stripeCustomerId）
  let customerId = ent.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId },
    });
    customerId = customer.id;

    await prisma.userEntitlement.update({
      where: { userId },
      data: { stripeCustomerId: customerId },
    });
  }

  // 3) 建 checkout session（订阅）
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/billing?success=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/billing?canceled=1`,
    metadata: { userId, plan },
  });

  return NextResponse.json({ ok: true, url: checkout.url });
}
