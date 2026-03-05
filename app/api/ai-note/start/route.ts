// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { devBypassUserId } from "@/lib/auth/devBypass";
import { getRouteSessionUser } from "@/lib/auth/routeSession";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr = "AUTH_REQUIRED" | "DB_ERROR" | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) },
    { status }
  );
}

function dbHead() {
  return String(process.env.DATABASE_URL || "").slice(0, 40);
}

export async function POST(req: NextRequest) {
  try {
    // ✅ 打印一下到底有没有进来
    console.log("[ai-note/start] hit", { dbHead: dbHead() });

    const sessionUser = await getRouteSessionUser(req);
    const userId = sessionUser?.id ?? devBypassUserId();

    if (!userId) {
      if (process.env.NODE_ENV !== "production" || process.env.AI_NOTE_DEBUG_AUTH === "true") {
        let hasCookieHeader = false;
        try {
          const { headers } = await import("next/headers");
          const reqHeaders = await headers();
          hasCookieHeader = !!reqHeaders.get("cookie");
        } catch {
          hasCookieHeader = false;
        }
        console.log("[ai-note/start][auth-check]", {
          hasCookieHeader,
          hasUserId: !!sessionUser?.id,
          hasEmail: !!sessionUser?.email,
        });
      }
      return bad("AUTH_REQUIRED", 401);
    }

    const noteId = randomUUID();

    // ✅ 这里不要调用你不确定的 createNote，直接写 session，最稳定
    await prisma.aiNoteSession.create({
      data: { id: noteId, userId } as any,
    });

    return NextResponse.json({ ok: true, noteId });
  } catch (e: any) {
    // ✅ 一定要打完整错误（你现在缺的就是它）
    console.error("[ai-note/start] ERROR:", e);
    return bad("INTERNAL_ERROR", 500, String(e?.message || e), {
      name: e?.name,
      code: e?.code,
      dbHead: dbHead(),
    });
  }
}
