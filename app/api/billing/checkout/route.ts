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
  const session = await getServerSession(authOptions);

  let userId = (session as any)?.user?.id as string | undefined;

  // ✅ DEV 模式：后端也给一个“开发者用户”
  if (!userId && isLocalDev(req)) {
    const email = process.env.DEV_USER_EMAIL || "dev@local";

    // 确保 DB 里有这个 user（按你的 schema 可能是 email unique）
    const u = await prisma.user.upsert({
      where: { email },
      update: { name: "Developers" },
      create: { email, name: "Developers" },
    });

    userId = u.id;
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan === "ultra" ? "ultra" : "pro";

  const priceId = plan === "ultra" ? process.env.STRIPE_PRICE_ULTRA : process.env.STRIPE_PRICE_PRO;
  if (!priceId) return NextResponse.json({ ok: false, error: "MISSING_PRICE_ID" }, { status: 500 });

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
}
