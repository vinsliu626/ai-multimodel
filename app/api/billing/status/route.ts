import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // 你项目里如果路径不同，自己改
import { getEntitlementStatus } from "@/lib/billing/entitlement";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id;

  if (!userId) {
    // 未登录：前端会当成 basic + locked（你前端已经写了）
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const ent = await getEntitlementStatus(userId);
  return NextResponse.json(ent);
}
