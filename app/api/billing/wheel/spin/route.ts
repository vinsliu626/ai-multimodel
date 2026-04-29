import { NextResponse } from "next/server";
import { getUserIdOrDev } from "@/lib/auth/devUser";
import { spinProTrialWheel } from "@/lib/billing/proTrialWheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getUserIdOrDev(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED", message: "Please sign in to spin the Pro trial wheel." },
      { status: 401 }
    );
  }

  try {
    const result = await spinProTrialWheel(userId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[billing.wheel.spin] failed", { userId, message });

    if (message === "PRO_TRIAL_WHEEL_ALREADY_USED") {
      return NextResponse.json(
        {
          ok: false,
          error: message,
          message: "You've already used your free Pro Trial spin.",
        },
        { status: 403 }
      );
    }

    if (message === "PRO_TRIAL_WHEEL_NOT_ELIGIBLE") {
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }

    return NextResponse.json({ ok: false, error: "PRO_TRIAL_WHEEL_SPIN_FAILED" }, { status: 500 });
  }
}
