export type OutlineSection = {
  id: string;
  heading: string;
  summary: string;
  keyPoints: string[];
  sourceText: string;
};

export type OutlineResult = {
  title: string;
  language: "en" | "zh" | "auto";
  sourceType: "lecture" | "meeting" | "quiz_review" | "study_material" | "general";
  sections: OutlineSection[];
};

export type SectionNotes = {
  id: string;
  heading: string;
  bullets: string[];
  keyTerms: { term: string; definition: string }[];
  examples: string[];
  actionItems: string[];
};

export type FinalNote = {
  title: string;
  executiveSummary: string[];
  sections: { heading: string; bullets: string[] }[];
  keyTerms: { term: string; definition: string }[];
  takeaways: string[];
  studyAids: { label: string; items: string[] }[];
  answerKey: string[];
  markdown: string;
};
