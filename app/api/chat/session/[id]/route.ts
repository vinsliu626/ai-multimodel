import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  return userId ?? null;
}

// ✅ Next.js 16: context.params is Promise
type RouteContext = { params: Promise<{ id: string }> };

// ---------------- GET：拿某个会话的全部消息 ----------------
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "unauthorized");

    const { prisma } = await import("@/lib/prisma");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "missing_id");

    const sessionRow = await prisma.chatSession.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!sessionRow) return jsonErr(404, "not_found");

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, messages }, { status: 200 });
  } catch (err: any) {
    console.error("加载会话消息失败：", err);
    return jsonErr(500, err?.message ?? "load_session_failed");
  }
}

// ---------------- DELETE：删除会话 + 消息 ----------------
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "unauthorized");

    const { prisma } = await import("@/lib/prisma");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "missing_id");

    const sessionRow = await prisma.chatSession.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!sessionRow) return jsonErr(404, "not_found");

    await prisma.chatMessage.deleteMany({ where: { chatSessionId: id } });
    await prisma.chatSession.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("删除会话失败：", err);
    return jsonErr(500, err?.message ?? "delete_failed");
  }
}

// ---------------- PATCH：重命名 / 置顶 ----------------
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "unauthorized");

    const { prisma } = await import("@/lib/prisma");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "missing_id");

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const pinned = typeof body?.pinned === "boolean" ? body.pinned : undefined;

    if (title !== undefined && title.length === 0) return jsonErr(400, "title_empty");
    if (title === undefined && pinned === undefined) return jsonErr(400, "nothing_to_update");

    const sessionRow = await prisma.chatSession.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!sessionRow) return jsonErr(404, "not_found");

    const updated = await prisma.chatSession.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
      },
      select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, session: updated }, { status: 200 });
  } catch (err: any) {
    console.error("PATCH 会话失败：", err);
    return jsonErr(500, err?.message ?? "patch_failed");
  }
}