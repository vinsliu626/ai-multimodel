import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { mutationResultSelect } from "@/lib/billing/entitlementDb";
import { getUserIdOrDev } from "@/lib/auth/devUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user?.id as string | undefined) ?? (await getUserIdOrDev());
  if (!userId) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });

  const ent = await prisma.userEntitlement.findUnique({
    where: { userId },
    select: {
      ...mutationResultSelect,
      stripeCustomerId: true,
    },
  });
  const customerId = ent?.stripeCustomerId;

  if (!customerId) {
    return NextResponse.json({ ok: false, error: "NO_STRIPE_CUSTOMER" }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/account`,
  });

  return NextResponse.json({ ok: true, url: portal.url });
}
