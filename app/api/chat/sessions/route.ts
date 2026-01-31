import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: true, sessions: [] }, { status: 200 });
  }

  const { prisma } = await import("@/lib/prisma");

  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], // ✅ 置顶优先，然后按更新时间
    select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true },
    take: 200,
  });

  return NextResponse.json({ ok: true, sessions }, { status: 200 });
}