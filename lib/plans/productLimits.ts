export type PlanId = "basic" | "pro" | "ultra";

export function normalizePlan(plan?: string | null): PlanId {
  return plan === "ultra" ? "ultra" : plan === "pro" ? "pro" : "basic";
}

export type ChatPlanLimits = {
  messagesPerDay: number;
  maxInputChars: number;
  budgetCharsPerWindow: number;
  budgetWindowHours: number;
  cooldownMs: number;
  maxOutputTokens: number;
};

export type NotePlanLimits = {
  generatesPerDay: number;
  maxInputChars: number;
  maxItems: number;
  cooldownMs: number;
};

export type StudyPlanLimitsConfig = {
  generationsPerDay: number;
  maxFileSizeBytes: number;
  maxExtractedChars: number;
  maxQuizQuestions: number;
  maxSelectableModes: number;
  allowedDifficulties: ("easy" | "medium" | "hard")[];
  maxNotes: number;
  maxFlashcards: number;
  cooldownMs: number;
};

export type ProductPlanLimits = {
  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  canSeeSuspiciousSentences: boolean;
  chat: ChatPlanLimits;
  note: NotePlanLimits;
  study: StudyPlanLimitsConfig;
};

export const PRODUCT_PLAN_LIMITS: Record<PlanId, ProductPlanLimits> = {
  basic: {
    detectorWordsPerWeek: 5_000,
    noteSecondsPerWeek: 2 * 60 * 60,
    canSeeSuspiciousSentences: false,
    chat: {
      messagesPerDay: 20,
      maxInputChars: 2_500,
      budgetCharsPerWindow: 15_000,
      budgetWindowHours: 3,
      cooldownMs: 15_000,
      maxOutputTokens: 500,
    },
    note: {
      generatesPerDay: 3,
      maxInputChars: 12_000,
      maxItems: 8,
      cooldownMs: 60_000,
    },
    study: {
      generationsPerDay: 1,
      maxFileSizeBytes: 2 * 1024 * 1024,
      maxExtractedChars: 8_000,
      maxQuizQuestions: 10,
      maxSelectableModes: 2,
      allowedDifficulties: ["easy", "medium"],
      maxNotes: 6,
      maxFlashcards: 6,
      cooldownMs: 90_000,
    },
  },
  pro: {
    detectorWordsPerWeek: 25_000,
    noteSecondsPerWeek: 30 * 60 * 60,
    canSeeSuspiciousSentences: true,
    chat: {
      messagesPerDay: 80,
      maxInputChars: 6_000,
      budgetCharsPerWindow: 60_000,
      budgetWindowHours: 3,
      cooldownMs: 8_000,
      maxOutputTokens: 900,
    },
    note: {
      generatesPerDay: 12,
      maxInputChars: 30_000,
      maxItems: 12,
      cooldownMs: 20_000,
    },
    study: {
      generationsPerDay: 3,
      maxFileSizeBytes: 4 * 1024 * 1024,
      maxExtractedChars: 15_000,
      maxQuizQuestions: 20,
      maxSelectableModes: 3,
      allowedDifficulties: ["easy", "medium", "hard"],
      maxNotes: 8,
      maxFlashcards: 10,
      cooldownMs: 60_000,
    },
  },
  ultra: {
    detectorWordsPerWeek: null,
    noteSecondsPerWeek: null,
    canSeeSuspiciousSentences: true,
    chat: {
      messagesPerDay: 200,
      maxInputChars: 12_000,
      budgetCharsPerWindow: 150_000,
      budgetWindowHours: 3,
      cooldownMs: 5_000,
      maxOutputTokens: 1_400,
    },
    note: {
      generatesPerDay: 30,
      maxInputChars: 60_000,
      maxItems: 18,
      cooldownMs: 10_000,
    },
    study: {
      generationsPerDay: 8,
      maxFileSizeBytes: 8 * 1024 * 1024,
      maxExtractedChars: 25_000,
      maxQuizQuestions: 30,
      maxSelectableModes: 3,
      allowedDifficulties: ["easy", "medium", "hard"],
      maxNotes: 10,
      maxFlashcards: 14,
      cooldownMs: 45_000,
    },
  },
};

export function getProductPlanLimits(plan?: string | null): ProductPlanLimits {
  return PRODUCT_PLAN_LIMITS[normalizePlan(plan)];
}

export function getChatPlanLimits(plan?: string | null): ChatPlanLimits {
  return getProductPlanLimits(plan).chat;
}

export function getNotePlanLimits(plan?: string | null): NotePlanLimits {
  return getProductPlanLimits(plan).note;
}

export function getStudyBasePlanLimits(plan?: string | null): StudyPlanLimitsConfig {
  return getProductPlanLimits(plan).study;
}
