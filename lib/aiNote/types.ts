export type OutlineSection = {
  id: string;
  heading: string;
  summary: string;
  keyPoints: string[];
  sourceText: string; // 这一段对应的原文片段（后面给第二个模型）
};

export type OutlineResult = {
  title: string;
  language: "en" | "zh" | "auto";
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
  tldr: string[];
  outline: { heading: string; bullets: string[] }[];
  keyTerms: { term: string; definition: string }[];
  reviewChecklist: string[];
  quiz: { q: string; a: string }[];
  markdown: string; // 最终可直接渲染/复制
};
