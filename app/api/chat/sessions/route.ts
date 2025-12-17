// app/api/chat/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/chat/sessions
// 返回当前用户的会话列表（你现在没做登录关联，就先按所有会话）
export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import("@/lib/prisma");

    // 如果以后要按 userId 过滤，这里可以加 where: { userId }
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // ✅ 前端用的是 data.sessions，这里一定要有 sessions 这个字段
    return NextResponse.json(
      {
        ok: true,
        sessions,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("加载会话列表失败：", err);
    // 出错时也返回 sessions: []，避免前端报错
    return NextResponse.json(
      {
        ok: false,
        sessions: [],
        error: err?.message ?? "加载会话列表失败",
      },
      { status: 500 }
    );
  }
}
