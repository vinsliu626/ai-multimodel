// app/api/chat/messages/route.ts

// 🚫 最关键的两行：禁止 Next.js 在构建阶段预渲染这个 route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "缺少 sessionId 参数" },
        { status: 400 }
      );
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "会话不存在" },
        { status: 404 }
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("/api/chat/messages 出错：", err);
    return NextResponse.json(
      { error: "获取会话消息失败：" + (err?.message ?? "未知错误") },
      { status: 500 }
    );
  }
}
