// app/api/ai-note/start/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createNote } from "@/lib/aiNote/noteStore";
import { devBypassUserId } from "@/lib/auth/devBypass";
import { getRouteSessionUser } from "@/lib/auth/routeSession";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getRouteSessionUser(req);
    const userId = sessionUser?.id ?? devBypassUserId();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const noteId = randomUUID();

    // ✅ 关键：把 createNote 的异常也抓出来
    await createNote(noteId, userId);

    return NextResponse.json({ ok: true, noteId });
  } catch (e: any) {
    console.error("[/api/ai-note/start] ERROR:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "START_FAILED",
        message: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
