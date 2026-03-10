// lib/billing/constants.ts
export type PlanId = "basic" | "pro" | "ultra";
export type UsageType =
  | "detector_words"
  | "note_seconds"
  | "chat_count"
  | "study_count"
  | "chat_input_chars"
  | "note_generate_count";

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
    chatPerDay: 20,
    canSeeSuspiciousSentences: false,
  },
  pro: {
    detectorWordsPerWeek: 25000,
    noteSecondsPerWeek: 30 * 3600,
    chatPerDay: 80,
    canSeeSuspiciousSentences: true,
  },
  ultra: {
    detectorWordsPerWeek: null,
    noteSecondsPerWeek: null,
    chatPerDay: 200,
    canSeeSuspiciousSentences: true,
  },
};
