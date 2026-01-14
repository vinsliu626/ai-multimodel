// app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureCustomerId(userId: string) {
  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  let customerId = ent.stripeCustomerId;

  // 没有就创建
  if (!customerId) {
    const c = await stripe.customers.create({ metadata: { userId } });
    await prisma.userEntitlement.update({
      where: { userId },
      data: { stripeCustomerId: c.id },
    });
    return c.id;
  }

  // 有就验证存在（避免 test/live 混用导致 No such customer）
  try {
    await stripe.customers.retrieve(customerId);
    return customerId;
  } catch {
    // 不存在 => 重建
    const c = await stripe.customers.create({ metadata: { userId } });
    await prisma.userEntitlement.update({
      where: { userId },
      data: { stripeCustomerId: c.id },
    });
    return c.id;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const plan = body?.plan === "ultra" ? "ultra" : "pro";

    const priceId = plan === "ultra" ? process.env.STRIPE_PRICE_ULTRA : process.env.STRIPE_PRICE_PRO;
    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: plan === "ultra" ? "MISSING_PRICE_ULTRA" : "MISSING_PRICE_PRO" },
        { status: 500 }
      );
    }

    if (!priceId.startsWith("price_")) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PRICE_ID", message: `Expected price_..., got ${priceId}` },
        { status: 500 }
      );
    }

    const customerId = await ensureCustomerId(userId);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/chat?success=1&plan=${plan}`,
      cancel_url: `${baseUrl}/chat?canceled=1`,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "CHECKOUT_CREATE_FAILED",
        message: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
