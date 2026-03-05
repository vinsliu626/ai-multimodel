// app/api/chat/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "MISSING_SESSION_ID" }, { status: 400 });
    }

    const { prisma } = await import("@/lib/prisma");

    const sessionRow = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!sessionRow) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    return NextResponse.json({ messages }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[/api/chat/messages] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
