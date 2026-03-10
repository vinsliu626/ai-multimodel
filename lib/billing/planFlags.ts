import { getProductPlanLimits, normalizePlan, type PlanId } from "@/lib/plans/productLimits";

export type { PlanId };
export { normalizePlan };

export type PlanFlags = {
  plan: PlanId;
  canSeeSuspiciousSentences: boolean;
  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;
  unlimited?: boolean;
};

export function planToFlags(plan: PlanId): PlanFlags {
  const normalized = normalizePlan(plan);
  const limits = getProductPlanLimits(normalized);

  return {
    plan: normalized,
    canSeeSuspiciousSentences: limits.canSeeSuspiciousSentences,
    detectorWordsPerWeek: limits.detectorWordsPerWeek,
    noteSecondsPerWeek: limits.noteSecondsPerWeek,
    chatPerDay: limits.chat.messagesPerDay,
    unlimited: false,
  };
}
