import { getStudyBasePlanLimits, normalizePlan, type PlanId } from "@/lib/plans/productLimits";
import type { StudyPlanLimits } from "./types";

export const SUPPORTED_STUDY_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export const SUPPORTED_STUDY_EXTENSIONS = [".pdf", ".docx", ".pptx"];

export const STUDY_PLAN_LIMITS: Record<PlanId, StudyPlanLimits> = {
  basic: getStudyBasePlanLimits("basic"),
  pro: getStudyBasePlanLimits("pro"),
  ultra: getStudyBasePlanLimits("ultra"),
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
