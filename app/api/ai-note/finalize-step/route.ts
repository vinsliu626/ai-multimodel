// app/api/ai-note/finalize-step/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "DISABLED",
      message:
        "finalize-step is disabled (MediaRecorder timeslice chunks are not standalone WebM). Use /api/ai-note/finalize instead.",
    },
    { status: 410 }
  );
}
