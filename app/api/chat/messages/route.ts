// app/api/chat/messages/route.ts
import { NextRequest, NextResponse } from "next/server";

// 只告诉 Next：这是 Node 运行时 + 动态接口
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "缺少 sessionId 参数" },
        { status: 400 }
      );
    }

    // ⬇️⬇️ 关键：在这里才动态加载 prisma，而不是文件顶部静态 import
    const { prisma } = await import("@/lib/prisma");

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    return NextResponse.json({ messages }, { status: 200 });
  } catch (err: any) {
    console.error("[/api/chat/messages] Error:", err);
    return NextResponse.json(
      { error: err?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
