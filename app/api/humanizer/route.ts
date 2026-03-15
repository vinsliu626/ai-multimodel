import { NextResponse } from "next/server";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRouteSessionUser } from "@/lib/auth/routeSession";
import { HumanizerLimitError, assertHumanizerRequestAllowed, getHumanizerQuotaStatus, markHumanizerAttempt, recordHumanizerSuccess } from "@/lib/humanizer/quota";
import { runHumanizerPipeline } from "@/lib/humanizer/pipeline";
import { countHumanizerWords, normalizeHumanizerInput } from "@/lib/humanizer/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().min(1),
});

function friendlyHumanizerErrorMessage(code: string, fallback: string) {
  switch (code) {
    case "HUMANIZER_INPUT_TOO_SHORT":
      return "Please enter at least 20 words.";
    case "HUMANIZER_INPUT_TOO_LARGE":
      return "This request exceeds your plan's Humanizer limit.";
    case "HUMANIZER_WEEKLY_LIMIT_REACHED":
      return "You've reached your weekly Humanizer limit.";
    case "HUMANIZER_COOLDOWN_ACTIVE":
      return "Please wait a moment before submitting another Humanizer request.";
    default:
      return fallback;
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getRouteSessionUser(req);
    const userId = sessionUser?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "AUTH_REQUIRED", message: "Please sign in to use AI Humanizer." }, { status: 401 });
    }

    const body = requestSchema.parse(await req.json());
    const text = normalizeHumanizerInput(body.text);
    const inputWords = countHumanizerWords(text);
    await assertHumanizerRequestAllowed(userId, inputWords);
    markHumanizerAttempt(userId);

    const result = await runHumanizerPipeline({ text });
    await recordHumanizerSuccess(userId, result.usage.inputWords);
    const freshUsage = await getHumanizerQuotaStatus(userId);

    return NextResponse.json({
      success: true,
      output: result.output,
      usage: {
        inputWords: result.usage.inputWords,
        outputWords: result.usage.outputWords,
        remainingWeeklyWords: freshUsage.remainingThisWeek,
        weeklyLimit: freshUsage.limits.wordsPerWeek,
      },
      meta: result.meta,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: error.issues[0]?.message || "Invalid request." },
        { status: 400 }
      );
    }
    if (error instanceof HumanizerLimitError) {
      return NextResponse.json(
        { success: false, error: error.code, message: friendlyHumanizerErrorMessage(error.code, error.message) },
        { status: error.status }
      );
    }

    console.error("[/api/humanizer] error:", error);
    return NextResponse.json(
      { success: false, error: "HUMANIZER_FAILED", message: "Unable to humanize text right now. Please try again." },
      { status: 500 }
    );
  }
}
