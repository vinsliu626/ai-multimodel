// app/api/chat/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// 小工具：从 context / URL 里尽可能把 id 抠出来
async function getIdFromRequest(
  req: NextRequest,
  context: any
): Promise<string | null> {
  const rawParams = context?.params;

  // 1）处理动态路由参数（可能是对象或 Promise）
  if (rawParams) {
    try {
      const params =
        typeof rawParams.then === "function" ? await rawParams : rawParams;

      if (params?.id) {
        return params.id as string;
      }
    } catch {
      // 忽略错误，继续后面的逻辑
    }
  }

  // 2）从 URL 路径获取
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSeg = segments[segments.length - 1];
  if (lastSeg && lastSeg !== "session") {
    return lastSeg;
  }

  // 3）从 query 参数获取
  const idFromQuery = url.searchParams.get("id");
  if (idFromQuery) return idFromQuery;

  return null;
}

// ---------------- GET：拿某个会话的全部消息 ----------------
export async function GET(req: NextRequest, context: any) {
  const id = await getIdFromRequest(req, context);

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "缺少 id 参数" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, messages });
  } catch (err: any) {
    console.error("加载会话消息失败：", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "加载会话消息失败" },
      { status: 500 }
    );
  }
}

// ---------------- DELETE：删除会话 + 消息 ----------------
export async function DELETE(req: NextRequest, context: any) {
  const id = await getIdFromRequest(req, context);

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "缺少 id 参数" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // 先删消息，再删会话
    await prisma.chatMessage.deleteMany({
      where: { chatSessionId: id },
    });

    await prisma.chatSession.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("删除会话失败：", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "删除会话失败" },
      { status: 500 }
    );
  }
}
