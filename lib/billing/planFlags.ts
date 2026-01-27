export type PlanId = "basic" | "pro" | "ultra";

export function normalizePlan(plan?: string | null): PlanId {
  return plan === "ultra" ? "ultra" : plan === "pro" ? "pro" : "basic";
}

export function planToFlags(plan: PlanId) {
  const p = normalizePlan(plan);
  return {
    plan: p,
    canSeeSuspiciousSentences: p !== "basic",
    detectorWordsPerWeek: p === "basic" ? 5000 : p === "pro" ? 15000 : null,
    noteSecondsPerWeek: p === "basic" ? 2 * 3600 : p === "pro" ? 15 * 3600 : null,
    chatPerDay: p === "basic" ? 10 : null,
  };
}
