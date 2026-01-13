import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLocalDev(req: Request) {
  const host = req.headers.get("host") || "";
  return (
    process.env.NEXT_PUBLIC_DEV_MODE === "true" &&
    process.env.NODE_ENV !== "production" &&
    (host.includes("localhost") || host.includes("127.0.0.1"))
  );
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

    // ✅ 关键：先检查 stripe key
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "MISSING_STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const priceId =
      plan === "ultra" ? process.env.STRIPE_PRICE_ULTRA : process.env.STRIPE_PRICE_PRO;

    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: plan === "ultra" ? "MISSING_PRICE_ULTRA" : "MISSING_PRICE_PRO" },
        { status: 500 }
      );
    }

    const ent = await prisma.userEntitlement.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    let customerId = (ent as any).stripeCustomerId ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { userId } });
      customerId = customer.id;

      await prisma.userEntitlement.update({
        where: { userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing?success=1`,
      cancel_url: `${baseUrl}/billing?canceled=1`,
      metadata: { userId, plan },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e: any) {
    // ✅ 把 Stripe 的真实错误吐给你（本地调试用）
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
