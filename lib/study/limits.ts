import { normalizePlan, type PlanId } from "@/lib/billing/planFlags";
import type { StudyPlanLimits } from "./types";

export const SUPPORTED_STUDY_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export const SUPPORTED_STUDY_EXTENSIONS = [".pdf", ".docx", ".pptx"];

export const STUDY_PLAN_LIMITS: Record<PlanId, StudyPlanLimits> = {
  basic: {
    generationsPerDay: 1,
    maxFileSizeBytes: 2 * 1024 * 1024,
    maxExtractedChars: 8_000,
    maxQuizQuestions: 6,
    maxSelectableModes: 2,
    allowedDifficulties: ["easy", "medium"],
    maxNotes: 6,
    maxFlashcards: 6,
    cooldownMs: 90_000,
  },
  pro: {
    generationsPerDay: 3,
    maxFileSizeBytes: 4 * 1024 * 1024,
    maxExtractedChars: 15_000,
    maxQuizQuestions: 12,
    maxSelectableModes: 3,
    allowedDifficulties: ["easy", "medium", "hard"],
    maxNotes: 8,
    maxFlashcards: 10,
    cooldownMs: 60_000,
  },
  ultra: {
    generationsPerDay: 8,
    maxFileSizeBytes: 8 * 1024 * 1024,
    maxExtractedChars: 25_000,
    maxQuizQuestions: 20,
    maxSelectableModes: 3,
    allowedDifficulties: ["easy", "medium", "hard"],
    maxNotes: 10,
    maxFlashcards: 14,
    cooldownMs: 45_000,
  },
};

function parseCooldownOverrideMs(): number | null {
  const raw = process.env.STUDY_COOLDOWN_MS;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : null;
}

function resolveCooldownMs(plan: PlanId): number {
  const override = parseCooldownOverrideMs();
  if (override !== null) return override;
  if (process.env.NODE_ENV !== "production") return 5_000;
  return STUDY_PLAN_LIMITS[plan].cooldownMs;
}

export function getStudyPlanLimits(plan?: string | null): StudyPlanLimits {
  const normalizedPlan = normalizePlan(plan);
  const base = STUDY_PLAN_LIMITS[normalizedPlan];
  return {
    ...base,
    cooldownMs: resolveCooldownMs(normalizedPlan),
  };
}

export function getStudySupportedTypesLabel() {
  return SUPPORTED_STUDY_EXTENSIONS.join(" / ");
}
