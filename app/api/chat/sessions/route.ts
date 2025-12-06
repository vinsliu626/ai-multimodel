// app/api/chat/sessions/route.ts

// 🚫 禁止构建阶段预渲染
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/chat/sessions
export async function GET() {
  try {
    // 临时用户 ID，之后可替换真实用户
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
