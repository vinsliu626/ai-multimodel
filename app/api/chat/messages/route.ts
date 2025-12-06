// app/api/chat/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 完全禁止 Next.js 尝试预渲染这个接口 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store"; 
export const preferredRegion = "auto";

/** 明确告诉 Next：这是纯 runtime API，不参与 page-data 收集 */
export const experimental_ppr = false;

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "缺少 sessionId 参数" },
        { status: 400 }
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("[/api/chat/messages] Error:", err);
    return NextResponse.json(
      { error: err?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
