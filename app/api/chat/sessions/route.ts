// app/api/chat/sessions/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/chat/sessions
export async function GET() {
  try {
    // 这里先用 anonymous，之后可以用 session.user.id 区分用户
    const userId = "anonymous";

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (err: any) {
    console.error("加载会话列表失败：", err);
    return NextResponse.json(
      { sessions: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
