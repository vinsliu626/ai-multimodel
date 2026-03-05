// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { normalizePlan, planToFlags, type PlanId } from "@/lib/billing/planFlags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ??priceId  plan?
function planFromPriceId(priceId?: string | null): PlanId {
  const pro = process.env.STRIPE_PRICE_PRO;
  const ultra = process.env.STRIPE_PRICE_ULTRA;

  if (ultra && priceId === ultra) return "ultra";
  if (pro && priceId === pro) return "pro";
  return "basic";
}

// ?Stripe invoice  priceId
function extractPriceIdFromInvoice(inv: any): string | null {
  // invoice.lines.data[0].price.id
  const lines = inv?.lines?.data;
  if (Array.isArray(lines) && lines.length > 0) {
    const priceId = lines[0]?.price?.id ?? lines[0]?.plan?.id ?? null;
    return priceId ? String(priceId) : null;
  }
  return null;
}

// ?subscription items  priceId
function extractPriceIdFromSubscription(sub: any): string | null {
  const items = sub?.items?.data;
  if (Array.isArray(items) && items.length > 0) {
    const priceId = items[0]?.price?.id ?? items[0]?.plan?.id ?? null;
    return priceId ? String(priceId) : null;
  }
  return null;
}

async function markProcessed(eventId: string, type: string) {
  // ?
  try {
    await prisma.processedStripeEvent.create({
      data: { eventId, type },
    });
    return { already: false };
  } catch (e: any) {
    // unique constraint => already processed
    return { already: true };
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) return NextResponse.json({ ok: false, error: "NO_SIGNATURE" }, { status: 400 });
  if (!whsec) return NextResponse.json({ ok: false, error: "NO_WEBHOOK_SECRET" }, { status: 500 });

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

  // ?
  const processed = await markProcessed(event.id, event.type);
  if (processed.already) return NextResponse.json({ ok: true, deduped: true });
  const lockEventId = event.id as string;

  try {
    switch (event.type) {
      /**
       * ??checkout ?Pro/Ultra
       *   ?
       */
      case "checkout.session.completed": {
        const s = event.data.object as any;

        const userId = (s?.metadata?.userId as string | undefined) || undefined;
        const customerId = (s?.customer as string | null) ?? null;
        const subscriptionId = (s?.subscription as string | null) ?? null;

        if (userId) {
          await prisma.userEntitlement.upsert({
            where: { userId },
            update: {
              stripeCustomerId: customerId,
              stripeSubId: subscriptionId,
              // ?active
              stripeStatus: "pending",
            },
            create: {
              userId,
              stripeCustomerId: customerId,
              stripeSubId: subscriptionId,
              stripeStatus: "pending",
            },
          });
        }
        break;
      }

      /**
       * ??=> ?
       * ?invoice.paid ?
       */
      case "invoice.paid": {
        const inv = event.data.object as any;

        const subscriptionId = (inv?.subscription as string | null) ?? null;
        const customerId = (inv?.customer as string | null) ?? null;
        const priceId = extractPriceIdFromInvoice(inv);
        const plan = planFromPriceId(priceId);

        // ?customerId ?subscriptionId ?entitlement
        const ent = await prisma.userEntitlement.findFirst({
          where: {
            OR: [
              customerId ? { stripeCustomerId: customerId } : undefined,
              subscriptionId ? { stripeSubId: subscriptionId } : undefined,
            ].filter(Boolean) as any,
          },
          select: { userId: true },
        });

        if (!ent?.userId) break;

        // eriod end 
        let currentPeriodEnd: Date | null = null;
        let cancelAtPeriodEnd: boolean | null = null as any;
        let stripeStatus: string | null = "active";

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const subAny: any = (sub as any).data ?? sub;
          stripeStatus = subAny?.status ?? "active";
          cancelAtPeriodEnd = Boolean(subAny?.cancel_at_period_end ?? false);
          currentPeriodEnd = subAny?.current_period_end
            ? new Date(subAny.current_period_end * 1000)
            : null;
        }

        const flags = planToFlags(plan);

        await prisma.userEntitlement.update({
          where: { userId: ent.userId },
          data: {
            ...flags,
            stripeStatus: stripeStatus ?? "active",
            stripeSubId: subscriptionId,
            stripeCustomerId: customerId,
            currentPeriodEnd: currentPeriodEnd ?? undefined,
            cancelAtPeriodEnd: cancelAtPeriodEnd ?? undefined,
            // ??unlimited/unlimitedSource
          },
        });

        break;
      }

      /**
       * ?ast_due / unpaid?> 
       */
      case "invoice.payment_failed": {
        const inv = event.data.object as any;
        const subscriptionId = (inv?.subscription as string | null) ?? null;
        const customerId = (inv?.customer as string | null) ?? null;

        const ent = await prisma.userEntitlement.findFirst({
          where: {
            OR: [
              customerId ? { stripeCustomerId: customerId } : undefined,
              subscriptionId ? { stripeSubId: subscriptionId } : undefined,
            ].filter(Boolean) as any,
          },
          select: { userId: true },
        });
        if (!ent?.userId) break;

        const flags = planToFlags("basic");

        await prisma.userEntitlement.update({
          where: { userId: ent.userId },
          data: {
            ...flags,
            stripeStatus: "past_due",
            //  stripeSubId/stripeCustomerId 
          },
        });

        break;
      }

      /**
       * ?/?
       */
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const customerId = (sub?.customer as string | undefined) || undefined;
        const subscriptionId = (sub?.id as string | undefined) || undefined;
        const status = (sub?.status as string | undefined) || "unknown";

        if (!customerId) break;

        const ent = await prisma.userEntitlement.findFirst({
          where: { stripeCustomerId: customerId },
          select: { userId: true },
        });
        if (!ent?.userId) break;

        const priceId = extractPriceIdFromSubscription(sub);
        const plan = planFromPriceId(priceId);

        const currentPeriodEnd = sub?.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;
        const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end ?? false);

        if (status === "active") {
          const flags = planToFlags(plan);
          await prisma.userEntitlement.update({
            where: { userId: ent.userId },
            data: {
              ...flags,
              stripeSubId: subscriptionId ?? null,
              stripeStatus: status ?? null,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              cancelAtPeriodEnd,
            },
          });
        } else {
          // ? active  basic
          const flags = planToFlags("basic");
          await prisma.userEntitlement.update({
            where: { userId: ent.userId },
            data: {
              ...flags,
              stripeSubId: subscriptionId ?? null,
              stripeStatus: status ?? null,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              cancelAtPeriodEnd,
            },
          });
        }

        break;
      }

      default:
        // ignore
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Release dedup lock on handler failure so Stripe retries can reprocess this event.
    try {
      await prisma.processedStripeEvent.delete({ where: { eventId: lockEventId } });
    } catch {
      // Ignore cleanup errors and return the original failure below.
    }
    console.error("[stripe.webhook] handler failed:", e);
    return NextResponse.json(
      { ok: false, error: "WEBHOOK_HANDLER_FAILED", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}


