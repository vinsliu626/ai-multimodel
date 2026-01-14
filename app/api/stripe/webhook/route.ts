import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 你自己的价格映射（用 PRICE_ID 判断 plan，防止 metadata 丢失）
function planFromPriceId(priceId?: string | null): "pro" | "ultra" | null {
  if (!priceId) return null;
  if (process.env.STRIPE_PRICE_PRO && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (process.env.STRIPE_PRICE_ULTRA && priceId === process.env.STRIPE_PRICE_ULTRA) return "ultra";
  return null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature"); // ❗不要 await
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json(
      { ok: false, error: "MISSING_STRIPE_SIGNATURE_OR_WEBHOOK_SECRET" },
      { status: 400 }
    );
  }

  // ❗必须 raw text，不能 req.json()
  const rawBody = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_SIGNATURE", message: e?.message },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      /**
       * ✅ checkout 完成：这里是你最关键的“把用户升级”的时机
       * 建议以 session.metadata 为主，拿不到就从 line_items 价格推断
       */
      case "checkout.session.completed": {
        const session = event.data.object as any;

        const userId = session?.metadata?.userId as string | undefined;

        // subscription/customer
        const subscriptionId = (session?.subscription as string | null) ?? null;
        const customerId = (session?.customer as string | null) ?? null;

        // plan：优先 metadata，其次用价格推断（更稳）
        let plan = (session?.metadata?.plan as "pro" | "ultra" | undefined) ?? null;

        if (!plan) {
          // 取 line_items 需要 expand，不然 session 里可能没有
          const full = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["line_items.data.price"],
          });
          const priceId = full?.line_items?.data?.[0]?.price?.id ?? null;
          plan = planFromPriceId(priceId) ?? "pro";
        }

        if (!userId) {
          // 没 userId 也别 500，直接 200 吃掉事件，避免 Stripe 重试轰炸
          return NextResponse.json({ ok: true, skipped: "MISSING_USERID" }, { status: 200 });
        }

        const unlimited = plan === "ultra";
        const canSeeSuspiciousSentences = plan === "pro" || plan === "ultra";

        await prisma.userEntitlement.upsert({
          where: { userId },
          update: {
            plan,
            unlimited,
            canSeeSuspiciousSentences,
            stripeCustomerId: customerId,
            // 如果你 schema 里有 stripeSubId / stripeStatus 就写；没有就删掉这两行
            stripeSubId: subscriptionId,
            stripeStatus: "active",
          } as any,
          create: {
            userId,
            plan,
            unlimited,
            canSeeSuspiciousSentences,
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            stripeStatus: "active",
          } as any,
        });

        break;
      }

      /**
       * ✅ 订阅更新/取消：不要在这里强行 plan="pro"
       * 正确做法：从订阅 item 的 priceId 推断 pro/ultra
       */
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;

        const customerId = sub?.customer as string | undefined;
        const status = sub?.status as string | undefined;
        const subscriptionId = sub?.id as string | undefined;

        // 订阅第一个 item 的 price.id
        const priceId =
          sub?.items?.data?.[0]?.price?.id ??
          sub?.items?.data?.[0]?.plan?.id ??
          null;

        const planFromPrice = planFromPriceId(priceId);

        if (!customerId) break;

        // 用 entitlement 表反查 user
        const ent = await prisma.userEntitlement.findFirst({
          where: { stripeCustomerId: customerId },
          select: { userId: true },
        });
        if (!ent?.userId) break;

        const isActive = status === "active" || status === "trialing";

        await prisma.userEntitlement.update({
          where: { userId: ent.userId },
          data: {
            stripeSubId: subscriptionId ?? null,
            stripeStatus: status ?? null,
            plan: isActive ? (planFromPrice ?? "pro") : "basic",
            unlimited: isActive ? (planFromPrice === "ultra") : false,
            canSeeSuspiciousSentences: isActive,
          } as any,
        });

        break;
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    // 这里如果 500，Stripe 会重试；但你本地调试时确实需要看到错误
    return NextResponse.json(
      { ok: false, error: "WEBHOOK_HANDLER_FAILED", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
