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
  usedChatCountToday: number;

  canSeeSuspiciousSentences: boolean;
};