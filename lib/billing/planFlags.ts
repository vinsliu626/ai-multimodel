// lib/billing/planFlags.ts
export type PlanId = "basic" | "pro" | "ultra";

export function normalizePlan(plan?: string | null): PlanId {
  return plan === "ultra" ? "ultra" : plan === "pro" ? "pro" : "basic";
}

export type PlanFlags = {
  plan: PlanId;
  canSeeSuspiciousSentences: boolean;
  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;
  unlimited?: boolean; // 可选：仅供你内部使用（DB 里也有 unlimited 字段）
};

export function planToFlags(plan: PlanId): PlanFlags {
  const p = normalizePlan(plan);

  switch (p) {
    case "basic":
      return {
        plan: "basic",
        canSeeSuspiciousSentences: false,
        detectorWordsPerWeek: 5000,
        noteSecondsPerWeek: 2 * 60 * 60, // 7200
        chatPerDay: 10,
        unlimited: false,
      };

    case "pro":
      return {
        plan: "pro",
        canSeeSuspiciousSentences: true,
        detectorWordsPerWeek: 25000,
        noteSecondsPerWeek: 30 * 60 * 60, // 108000
        chatPerDay: 1_000_000, // “无限聊天”
        unlimited: false,
      };

    case "ultra":
      return {
        plan: "ultra",
        canSeeSuspiciousSentences: true,
        detectorWordsPerWeek: null,
        noteSecondsPerWeek: null,
        chatPerDay: null,
        unlimited: true,
      };
  }
}