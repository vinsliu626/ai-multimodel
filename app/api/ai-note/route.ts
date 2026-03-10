import { NextResponse } from "next/server";
import { transcribeAudioToText } from "@/lib/asr/transcribe";
import { callGroqTranscribe } from "@/lib/ai/groq";
import { generateStructuredNotes } from "@/lib/aiNote/generate";
import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { assertNoteRequestAllowed, getNoteQuotaStatus, markNoteAttempt, NoteLimitError, recordNoteGenerateSuccess } from "@/lib/aiNote/quota";
import { devBypassUserId } from "@/lib/auth/devBypass";
import { getRouteSessionUser } from "@/lib/auth/routeSession";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function friendlyNoteErrorMessage(code: string, fallback: string) {
  switch (code) {
    case "NOTE_DAILY_LIMIT_REACHED":
      return "You've used all AI Note generations for today.";
    case "NOTE_COOLDOWN_ACTIVE":
      return "Please wait a moment before sending another request.";
    case "NOTE_INPUT_TOO_LARGE":
      return "This text is too long for your current plan.";
    case "AUTH_REQUIRED":
      return "Please sign in to use AI Notes.";
    default:
      return fallback;
  }
}

async function transcribeUpload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await transcribeAudioToText(bytes, {
      filename: file.name,
      mime: file.type || "audio/webm",
    });
  } catch (error) {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw error;
    const fallback = await callGroqTranscribe({
      apiKey: groqKey,
      audio: Buffer.from(bytes),
      mime: file.type || "audio/webm",
      filename: file.name,
    });
    return fallback.text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getRouteSessionUser(req);
    const userId = sessionUser?.id ?? devBypassUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", message: "Please sign in to use AI Notes." }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    let inputText = "";
    let inputType: "text" | "upload" = "text";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      inputText = String(body?.text || "").trim();
      inputType = "text";
    } else {
      const form = await req.formData();
      const file = form.get("file");
      inputType = "upload";
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "MISSING_FILE", message: "Please choose an audio file to generate notes." },
          { status: 400 }
        );
      }
      inputText = String(await transcribeUpload(file)).trim();
    }

    if (!inputText) {
      return NextResponse.json(
        { ok: false, error: "EMPTY_INPUT", message: "Add text or upload audio before generating notes." },
        { status: 400 }
      );
    }

    const quota = await assertNoteRequestAllowed(userId, inputText.length);
    markNoteAttempt(userId);

    if (inputType === "upload") {
      const estimatedSeconds = Math.max(1, Math.round(inputText.trim().split(/\s+/).filter(Boolean).length / 2.5));
      try {
        await assertQuotaOrThrow({ userId, action: "note", amount: estimatedSeconds });
      } catch (error) {
        if (error instanceof QuotaError) {
          return NextResponse.json(
            { ok: false, error: error.code, message: "You've reached your AI Note usage limit for now. Please try again later." },
            { status: error.status ?? 429 }
          );
        }
        throw error;
      }
    }

    const boundedText = inputText.slice(0, quota.limits.maxInputChars);
    const note = await generateStructuredNotes({
      text: boundedText,
      isZh: /[\u4e00-\u9fff]/.test(boundedText),
      maxItems: quota.limits.maxItems,
      maxOutputTokens: quota.limits.maxItems <= 8 ? 700 : quota.limits.maxItems <= 15 ? 1_000 : 1_200,
    });

    await recordNoteGenerateSuccess(userId);
    const usage = await getNoteQuotaStatus(userId);

    return NextResponse.json({
      ok: true,
      note,
      usage: {
        usedToday: usage.usedToday,
        remainingToday: usage.remainingToday,
        limit: usage.limits.generatesPerDay,
      },
    });
  } catch (error) {
    if (error instanceof NoteLimitError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: friendlyNoteErrorMessage(error.code, error.message) },
        { status: error.status }
      );
    }
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: "You've reached your AI Note usage limit for now. Please try again later." },
        { status: error.status ?? 429 }
      );
    }

    console.error("[/api/ai-note] error:", error);
    return NextResponse.json(
      { ok: false, error: "NOTE_GENERATION_FAILED", message: "Unable to generate notes right now. Please try again." },
      { status: 500 }
    );
  }
}
