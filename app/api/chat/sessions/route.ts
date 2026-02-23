// app/api/chat/sessions/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) return NextResponse.json({ sessions: [] }, { status: 200 });

    const { prisma } = await import("@/lib/prisma");

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (e) {
    console.error("[/api/chat/sessions] DB error:", e);
    // ✅ 降级：永远返回 200 空列表，避免前端“断线感”
    return NextResponse.json({ sessions: [] }, { status: 200 });
  }
}