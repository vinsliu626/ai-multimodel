// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { normalizePlan, planToFlags, type PlanId } from "@/lib/billing/planFlags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ 用 priceId 决定 plan（更可信）
function planFromPriceId(priceId?: string | null): PlanId {
  const pro = process.env.STRIPE_PRICE_PRO;
  const ultra = process.env.STRIPE_PRICE_ULTRA;

  if (ultra && priceId === ultra) return "ultra";
  if (pro && priceId === pro) return "pro";
  return "basic";
}

// 从 Stripe invoice 里找订阅商品 priceId
function extractPriceIdFromInvoice(inv: any): string | null {
  // invoice.lines.data[0].price.id
  const lines = inv?.lines?.data;
  if (Array.isArray(lines) && lines.length > 0) {
    const priceId = lines[0]?.price?.id ?? lines[0]?.plan?.id ?? null;
    return priceId ? String(priceId) : null;
  }
  return null;
}

// 从 subscription items 里找 priceId
function extractPriceIdFromSubscription(sub: any): string | null {
  const items = sub?.items?.data;
  if (Array.isArray(items) && items.length > 0) {
    const priceId = items[0]?.price?.id ?? items[0]?.plan?.id ?? null;
    return priceId ? String(priceId) : null;
  }
  return null;
}

async function markProcessed(eventId: string, type: string) {
  // 幂等：已处理就直接跳过
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

  // ✅ 幂等
  const processed = await markProcessed(event.id, event.type);
  if (processed.already) return NextResponse.json({ ok: true, deduped: true });

  try {
    switch (event.type) {
      /**
       * ✅ 只“记录” checkout 完成，不在这里直接授予 Pro/Ultra
       *   因为你要严格：必须付款成功才开通
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
              // 不在这里写 active，避免“先开通后付款失败”的漏洞
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
       * ✅ 核心：发票付款成功 => 开通
       * 对订阅来说 invoice.paid 是最稳的“已付费”信号
       */
      case "invoice.paid": {
        const inv = event.data.object as any;

        const subscriptionId = (inv?.subscription as string | null) ?? null;
        const customerId = (inv?.customer as string | null) ?? null;
        const priceId = extractPriceIdFromInvoice(inv);
        const plan = planFromPriceId(priceId);

        // 用 customerId 或 subscriptionId 找 entitlement
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

        // 同步订阅信息（period end 等）
        let currentPeriodEnd: Date | null = null;
        let cancelAtPeriodEnd: boolean = false;
        let stripeStatus: string = "active";
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
            // ✅ 不要动 unlimited/unlimitedSource
          },
        });

        break;
      }

      /**
       * ✅ 发票付款失败（past_due / unpaid）=> 严格降级
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
            // 保留 stripeSubId/stripeCustomerId 便于后续恢复
          },
        });

        break;
      }

      /**
       * ✅ 订阅更新/删除：同步状态（辅助兜底）
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
          // ✅ 严格：非 active 直接降级 basic
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
    // ✅ 关键：这里必须返回非 2xx，让 Stripe 重试（避免丢单）
    console.error("[stripe.webhook] handler failed:", e);
    return NextResponse.json(
      { ok: false, error: "WEBHOOK_HANDLER_FAILED", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
