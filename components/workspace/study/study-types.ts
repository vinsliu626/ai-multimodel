export type StudyDifficulty = "easy" | "medium" | "hard";
export type StudyMode = "notes" | "flashcards" | "quiz";
export type StudyQuizType = "multiple_choice" | "fill_blank" | "matching";

export type StudyEntitlement = {
  plan: "basic" | "pro" | "ultra" | "gift";
  unlimited: boolean;
  studyGenerationsPerDay: number;
  studyMaxFileSizeBytes: number;
  studyMaxExtractedChars: number;
  studyMaxQuizQuestions: number;
  studyMaxSelectableModes?: number;
  studyAllowedDifficulties: StudyDifficulty[];
  usedStudyCountToday: number;
};

export type StudySessionListItem = {
  id: string;
  title: string;
  fileName: string | null;
  selectedModes: StudyMode[];
  selectedQuizTypes?: StudyQuizType[];
  createdAt: string;
  updatedAt: string;
};

export type StudyResult = {
  notes?: string[];
  flashcards?: Array<{
    front: string;
    back: string;
  }>;
  quiz?: StudyQuizItem[];
  meta: {
    selectedModes: StudyMode[];
    selectedQuizTypes?: StudyQuizType[];
    difficulty?: StudyDifficulty;
    generatedCounts: {
      notes?: number;
      flashcards?: number;
      quiz?: number;
    };
    truncated: boolean;
    originalCharCount: number;
    usedCharCount: number;
    cached?: boolean;
    title?: string;
    provider?: string;
    model?: string;
  };
};

export type StudyQuizItem =
  | {
      type: "multiple_choice";
      question: string;
      options: string[];
      answer: string;
      explanation?: string;
    }
  | {
      type: "fill_blank";
      question: string;
      answer: string;
      explanation?: string;
    }
  | {
      type: "matching";
      prompt: string;
      pairs: Array<{ left: string; right: string }>;
      explanation?: string;
    };
