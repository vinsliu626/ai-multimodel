export type StudyDifficulty = "easy" | "medium" | "hard";
export type StudyMode = "notes" | "flashcards" | "quiz";
export type StudyQuizType = "multiple_choice" | "fill_blank" | "matching";

export type StudyPlanLimits = {
  generationsPerDay: number;
  maxFileSizeBytes: number;
  maxExtractedChars: number;
  maxQuizQuestions: number;
  maxSelectableModes: number;
  allowedDifficulties: StudyDifficulty[];
  maxNotes: number;
  maxFlashcards: number;
  cooldownMs: number;
};

export type StudyRequestInput = {
  extractedText: string;
  title?: string;
  selectedModes: StudyMode[];
  quizTypes?: StudyQuizType[];
  quizCount?: number;
  flashcardCount?: number;
  noteCount?: number;
  difficulty?: StudyDifficulty;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
};

export type StudyFlashcard = { front: string; back: string };

export type StudyQuizMultipleChoiceItem = {
  type: "multiple_choice";
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
};

export type StudyQuizFillBlankItem = {
  type: "fill_blank";
  question: string;
  answer: string;
  explanation?: string;
};

export type StudyQuizMatchingItem = {
  type: "matching";
  prompt: string;
  pairs: Array<{ left: string; right: string }>;
  explanation?: string;
};

export type StudyQuizItem = StudyQuizMultipleChoiceItem | StudyQuizFillBlankItem | StudyQuizMatchingItem;

export type StudyGenerationResult = {
  notes?: string[];
  flashcards?: StudyFlashcard[];
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
