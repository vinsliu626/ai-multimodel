// app/api/chat/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET：根据会话 id 加载这条会话下的所有消息
export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { prisma } = await import("@/lib/prisma");

    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 id 参数" },
        { status: 400 }
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, messages }, { status: 200 });
  } catch (err: any) {
    console.error("加载会话消息失败：", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "加载会话消息失败" },
      { status: 500 }
    );
  }
}

// DELETE：删除会话下所有消息 + 会话本身
export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { prisma } = await import("@/lib/prisma");

    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 id 参数" },
        { status: 400 }
      );
    }

    // 先删这条会话下的所有消息
    await prisma.chatMessage.deleteMany({
      where: { chatSessionId: id },
    });

    // 再删会话本身
    await prisma.chatSession.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("删除会话失败：", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "删除会话失败" },
      { status: 500 }
    );
  }
}
