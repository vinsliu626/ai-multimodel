import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { deleteStudySession, getStudySessionById, renameStudySession } from "@/lib/study/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

function jsonErr(status: number, error: string, message?: string) {
  return NextResponse.json({ ok: false, error, ...(message ? { message } : {}) }, { status });
}

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  return userId ?? null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "UNAUTHORIZED");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "MISSING_ID");

    const row = await getStudySessionById(userId, id);
    if (!row) return jsonErr(404, "NOT_FOUND");

    return NextResponse.json({ ok: true, session: row }, { status: 200 });
  } catch (error) {
    console.error("[study/session/:id][GET] failed", error);
    return jsonErr(500, "LOAD_FAILED", "Failed to load study session.");
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "UNAUTHORIZED");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "MISSING_ID");

    const body = z.object({ title: z.string().trim().min(1).max(160) }).parse(await req.json());
    const updated = await renameStudySession(userId, id, body.title);
    if (updated.count === 0) return jsonErr(404, "NOT_FOUND");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonErr(400, "INVALID_REQUEST", error.issues[0]?.message || "Invalid title.");
    }
    console.error("[study/session/:id][PATCH] failed", error);
    return jsonErr(500, "PATCH_FAILED", "Failed to update study session title.");
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    if (!userId) return jsonErr(401, "UNAUTHORIZED");

    const { id } = await context.params;
    if (!id) return jsonErr(400, "MISSING_ID");

    const deleted = await deleteStudySession(userId, id);
    if (deleted.count === 0) return jsonErr(404, "NOT_FOUND");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[study/session/:id][DELETE] failed", error);
    return jsonErr(500, "DELETE_FAILED", "Failed to delete study session.");
  }
}
