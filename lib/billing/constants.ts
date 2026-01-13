// lib/billing/constants.ts
export type PlanId = "basic" | "pro" | "ultra";
export type UsageType = "detector_words" | "note_seconds" | "chat_count";

export type PlanLimits = {
  detectorWordsPerWeek: number | null; // null = unlimited
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;
  canSeeSuspiciousSentences: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  basic: {
    detectorWordsPerWeek: 5000,
    noteSecondsPerWeek: 2 * 3600,
    chatPerDay: 10,
    canSeeSuspiciousSentences: false,
  },
  pro: {
    detectorWordsPerWeek: 15000,
    noteSecondsPerWeek: 15 * 3600,
    chatPerDay: null, // unlimited chat
    canSeeSuspiciousSentences: true,
  },
  ultra: {
    detectorWordsPerWeek: null,
    noteSecondsPerWeek: null,
    chatPerDay: null,
    canSeeSuspiciousSentences: true,
  },
};
