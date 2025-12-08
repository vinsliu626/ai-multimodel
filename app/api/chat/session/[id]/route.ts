// app/api/chat/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------- GET：拿某个会话的全部消息 ----------------
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }  // ✅ 这里要用 Promise
) {
  try {
    const { prisma } = await import("@/lib/prisma");

    // ✅ 正确拿到 id：先 await 再解构
    const { id } = await context.params;

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

// ---------------- DELETE：删除会话 + 消息 ----------------
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }  // ✅ 同样如此
) {
  try {
    const { prisma } = await import("@/lib/prisma");

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 id 参数" },
        { status: 400 }
      );
    }

    await prisma.chatMessage.deleteMany({
      where: { chatSessionId: id },
    });

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

// ---------------- PATCH：重命名会话 ----------------
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import("@/lib/prisma");

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "缺少 id 参数" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const title = (body?.title as string | undefined)?.trim();

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "title 不能为空" },
        { status: 400 }
      );
    }

    const session = await prisma.chatSession.update({
      where: { id },
      data: { title },
    });

    return NextResponse.json({ ok: true, session }, { status: 200 });
  } catch (err: any) {
    console.error("重命名会话失败：", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "重命名会话失败" },
      { status: 500 }
    );
  }
}
