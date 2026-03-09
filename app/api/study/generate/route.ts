import { NextResponse } from "next/server";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRouteSessionUser } from "@/lib/auth/routeSession";
import { QuotaError } from "@/lib/billing/guard";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";
import { getStudyUsageStatus, assertStudyCooldownOrThrow, assertStudyQuotaOrThrow, markStudyAttempt } from "@/lib/study/quota";
import { generateStudyContent, sanitizeStudyText } from "@/lib/study/service";
import { SUPPORTED_STUDY_EXTENSIONS, SUPPORTED_STUDY_MIME_TYPES } from "@/lib/study/limits";
import { createStudySession } from "@/lib/study/history";
import type { StudyMode, StudyQuizType } from "@/lib/study/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const studyModes = ["notes", "flashcards", "quiz"] as const;
const quizTypes = ["multiple_choice", "fill_blank", "matching"] as const;

const requestSchema = z.object({
  extractedText: z.string().min(1),
  title: z.string().trim().max(160).optional(),
  selectedModes: z.array(z.enum(studyModes)).min(1).max(3),
  quizTypes: z.array(z.enum(quizTypes)).min(1).max(3).optional(),
  quizCount: z.number().int().min(1).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  fileName: z.string().trim().max(260).optional(),
  fileSizeBytes: z.number().int().min(0).max(8 * 1024 * 1024).optional(),
  mimeType: z.string().trim().max(200).optional(),
});

function extensionOf(fileName?: string) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

function isSupportedFile(input: { fileName?: string; mimeType?: string }) {
  const ext = extensionOf(input.fileName);
  return SUPPORTED_STUDY_EXTENSIONS.includes(ext) || (input.mimeType ? SUPPORTED_STUDY_MIME_TYPES.has(input.mimeType) : false);
}

function uniqueModes(modes: StudyMode[]) {
  return Array.from(new Set(modes));
}

function uniqueQuizTypes(types: StudyQuizType[] | undefined) {
  return Array.from(new Set(types ?? []));
}

function userMessageForQuotaError(err: QuotaError) {
  if (err.code === "STUDY_QUOTA_EXCEEDED") {
    return "You've used all Document Study generations for today. Upgrade your plan or come back tomorrow for more generations.";
  }
  if (err.code === "STUDY_COOLDOWN_ACTIVE") {
    return "Please wait a short moment before generating another document study set.";
  }
  return err.message || "Study generation is unavailable right now.";
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getRouteSessionUser(req);
    const userId = sessionUser?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = requestSchema.parse(await req.json());
    if (!isSupportedFile(body)) {
      return NextResponse.json(
        { ok: false, error: "UNSUPPORTED_FILE_TYPE", message: "Supported file types: PDF, DOCX, PPTX." },
        { status: 400 }
      );
    }

    const status = await withPrismaConnectionRetry(
      async () => {
        const quotaStatus = await assertStudyQuotaOrThrow(userId);
        assertStudyCooldownOrThrow(userId, quotaStatus.limits.cooldownMs);
        return quotaStatus;
      },
      { maxRetries: 1, retryDelayMs: 120, operationName: "study-quota-check" }
    );

    const selectedModes = uniqueModes(body.selectedModes);
    const selectedQuizTypes = uniqueQuizTypes(body.quizTypes);
    if (selectedModes.length > status.limits.maxSelectableModes) {
      return NextResponse.json(
        {
          ok: false,
          error: "TOO_MANY_MODES_SELECTED",
          message: `Your plan allows selecting up to ${status.limits.maxSelectableModes} study modes per generation.`,
        },
        { status: 400 }
      );
    }
    if (selectedModes.includes("quiz") && selectedQuizTypes.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "QUIZ_TYPES_REQUIRED",
          message: "Choose at least one quiz type to generate quiz questions.",
        },
        { status: 400 }
      );
    }

    if ((body.fileSizeBytes ?? 0) > status.limits.maxFileSizeBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: "FILE_TOO_LARGE",
          message: "This file is too large for your current plan.",
        },
        { status: 400 }
      );
    }

    const cleanedText = sanitizeStudyText(body.extractedText);
    if (!cleanedText) {
      return NextResponse.json(
        { ok: false, error: "EMPTY_EXTRACTED_TEXT", message: "No readable text was extracted from this document." },
        { status: 400 }
      );
    }

    if (body.quizCount && body.quizCount > status.limits.maxQuizQuestions) {
      return NextResponse.json(
        {
          ok: false,
          error: "QUIZ_COUNT_TOO_HIGH",
          message: `Your plan allows up to ${status.limits.maxQuizQuestions} quiz questions per request.`,
        },
        { status: 400 }
      );
    }

    if (body.difficulty && !status.limits.allowedDifficulties.includes(body.difficulty)) {
      return NextResponse.json(
        {
          ok: false,
          error: "DIFFICULTY_NOT_ALLOWED",
          message: `Your plan supports: ${status.limits.allowedDifficulties.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    markStudyAttempt(userId);

    const generated = await generateStudyContent({
      userId,
      plan: status.plan,
      input: {
        ...body,
        selectedModes,
        quizTypes: selectedModes.includes("quiz") ? selectedQuizTypes : undefined,
      },
    });

    const title = (body.title?.trim() || body.fileName?.replace(/\.[^.]+$/, "") || "Document Study").slice(0, 160);
    const studySession = await createStudySession({
      userId,
      title,
      fileName: body.fileName,
      fileSizeBytes: body.fileSizeBytes,
      mimeType: body.mimeType,
      selectedModes,
      selectedQuizTypes: selectedModes.includes("quiz") ? selectedQuizTypes : [],
      result: generated.result,
    });

    const freshStatus = await getStudyUsageStatus(userId);

    return NextResponse.json({
      ok: true,
      ...generated.result,
      session: studySession,
      usage: {
        usedToday: freshStatus.usedToday,
        remainingToday: freshStatus.remainingToday,
        limit: freshStatus.limits.generationsPerDay,
        cached: generated.cached,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "INVALID_REQUEST", message: error.issues[0]?.message || "Invalid request." },
        { status: 400 }
      );
    }
    if (error instanceof QuotaError) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[study.generate] quota error", { code: error.code, message: error.message });
      }
      return NextResponse.json({ ok: false, error: error.code, message: userMessageForQuotaError(error) }, { status: error.status });
    }
    if (isTransientPrismaConnectionError(error)) {
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE", message: "Database temporarily unavailable." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Study generation failed.";
    console.error("[study.generate] unexpected error", { message });
    return NextResponse.json(
      { ok: false, error: "STUDY_GENERATION_FAILED", message: "Unable to generate study materials right now. Please try again." },
      { status: 500 }
    );
  }
}
