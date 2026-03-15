export type PlanId = "basic" | "pro" | "ultra" | "gift";

export type Entitlement = {
  ok: true;
  plan: PlanId;
  unlimited: boolean;

  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;

  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedHumanizerWordsThisWeek?: number;
  usedChatCountToday: number;
  usedNoteGeneratesToday?: number;
  usedChatInputCharsWindow?: number;
  chatInputMaxChars?: number;
  chatBudgetCharsPerWindow?: number;
  chatBudgetWindowHours?: number;
  chatCooldownMs?: number;
  noteGeneratesPerDay?: number;
  noteInputMaxChars?: number;
  noteMaxItems?: number;
  noteCooldownMs?: number;
  humanizerWordsPerWeek?: number;
  humanizerMaxInputWords?: number;
  humanizerMinInputWords?: number;
  humanizerCooldownMs?: number;
  usedStudyCountToday?: number;
  studyGenerationsPerDay?: number;
  studyMaxFileSizeBytes?: number;
  studyMaxExtractedChars?: number;
  studyMaxQuizQuestions?: number;
  studyMaxSelectableModes?: number;
  studyAllowedDifficulties?: ("easy" | "medium" | "hard")[];

  canSeeSuspiciousSentences: boolean;
};
