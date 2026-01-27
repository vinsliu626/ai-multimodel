// app/api/billing/redeem/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim();
  if (!code) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async () => {
      const gift = await prisma.giftCode.findUnique({ where: { code } });
      if (!gift || !gift.isActive) return { ok: false as const, error: "INVALID_CODE" };

      if (gift.maxUses !== null && gift.usedCount >= gift.maxUses) {
        return { ok: false as const, error: "CODE_EXHAUSTED" };
      }

      const existing = await prisma.giftCodeRedemption.findUnique({
        where: { code_userId: { code, userId } },
      });

      if (!existing) {
        await prisma.giftCodeRedemption.create({ data: { code, userId } });
        await prisma.giftCode.update({
          where: { code },
          data: { usedCount: { increment: 1 } },
        });
      }

      await prisma.userEntitlement.upsert({
        where: { userId },
        create: { userId, plan: "basic", unlimited: true, unlimitedSource: "gift" },
        update: { unlimited: true, unlimitedSource: "gift" },
      });

      return { ok: true as const };
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "REDEEM_FAILED" }, { status: 500 });
  }
}
