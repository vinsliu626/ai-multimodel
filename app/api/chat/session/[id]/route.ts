// app/api/chat/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 小工具：从 context / URL 里尽可能把 id 抠出来
// 注意：这里用 any，同时兼容 context.params 是对象 或 Promise 的情况
async function getIdFromRequest(
  req: NextRequest,
  context: any
): Promise<string | null> {
  const rawParams = context?.params;

  // 1）Next 传进来的动态路由参数：可能是 { id: string }，也可能被标成 Promise<{ id: string }>
  if (rawParams) {
    try {
      const params =
        typeof rawParams.then === "function" ? await rawParams : rawParams;

      if (params?.id) {
        return params.id as string;
      }
    } catch {
      // 忽略解析 params 的错误，继续走 URL 兜底逻辑
    }
  }

  // 2）从 URL path 最后一个段拿，比如 /api/chat/session/xxxx
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSeg = segments[segments.length - 1];
  if (lastSeg && lastSeg !== "session") {
    return lastSeg;
  }

  // 3）兜底：看 query ?id=xxx
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
