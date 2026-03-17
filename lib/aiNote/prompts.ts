import type { SectionNotes } from "./types";

function outputLanguageRule(language: "en" | "zh" | "auto") {
  if (language === "zh") return "Write the final output in Chinese. Avoid awkward Chinese/English mixing.";
  if (language === "en") return "Write the final output in English unless the source strongly requires otherwise.";
  return "Match the dominant source language. If the source is mainly Chinese, write in Chinese. If mainly English, write in English. Avoid awkward mixed-language output.";
}

function sharedQualityRules(language: "en" | "zh" | "auto", maxItems?: number) {
  return [
    outputLanguageRule(language),
    "Default goal: create real study/useful notes, not extraction residue.",
    "Prioritize understanding over extraction, structure over dumping, and usefulness over verbosity.",
    "Do not paraphrase the transcript line by line.",
    "Do not produce decorative low-information summaries.",
    "Do not let answer-key lists dominate unless the user explicitly asked for answers only.",
    "If the source is a quiz, review session, game, or answer reveal, transform it into study notes first.",
    "For quiz-like material, organize around what is being tested, key concepts, patterns, rules, and likely confusion points.",
    'If recoverable answers are worth including, place them in a clearly separated final section named "Answer Key / Extracted Answers".',
    "Keep each knowledge point distinct. One concept, rule, or example should live in its own small section or subpoint.",
    "Use section headings and subheadings where helpful. Do not collapse everything into one wall of text.",
    "Do not turn every line into a separate card-like fragment either; keep it document-like and coherent.",
    "Use bullets only where they genuinely improve scanability. Use short paragraphs where explanation is clearer.",
    "Optional inline emphasis labels may be used naturally inside sections: STAR Important, Concept, LIGHTNING Tip, Example, Warning.",
    "Never invent unsupported details. If the source is noisy, incomplete, or uncertain, say so briefly and separate uncertainty from supported content.",
    typeof maxItems === "number"
      ? `Keep the main structured list density roughly within ${maxItems} items when practical, but do not sacrifice note quality just to compress output.`
      : null,
    "Before finalizing, internally verify that the note includes: a clear main topic, a coherent summary, organized sections, meaningful study value, and no over-dominant answer list unless explicitly requested.",
  ]
    .filter(Boolean)
    .join("\n");
}

function markdownDocumentRules() {
  return [
    "Use markdown-style plain text.",
    "Preferred final structure, when relevant:",
    "# Title",
    "## Executive Summary",
    "## Key Concepts",
    "## Main Notes",
    "## Important Terms",
    "## Takeaways",
    "## Study Aids",
    "## Answer Key / Extracted Answers",
    "Executive Summary should be 3 to 6 sentences maximum.",
    "Key Concepts should explain each concept briefly; do not output labels only.",
    "Main Notes should be grouped by themes or sections and preserve logical relationships.",
    "Include examples, definitions, comparisons, rules, and distinctions where they materially help understanding.",
    "Important Terms should appear only when genuinely relevant.",
    "Takeaways should be concise and review-oriented.",
    "Study Aids should be selective and useful: review questions, self-check questions, mini flashcards, memory hooks, or common confusion points.",
    "Do not make everything a bullet list.",
    "Do not return JSON unless explicitly requested.",
  ].join("\n");
}

export function buildDirectNoteSystemPrompt(maxItems: number, language: "en" | "zh") {
  return [
    "You are a high-quality note-writing assistant.",
    sharedQualityRules(language, maxItems),
    markdownDocumentRules(),
  ].join("\n\n");
}

export function buildDirectNoteUserPrompt(text: string, language: "en" | "zh") {
  return [
    language === "zh"
      ? "请根据以下内容生成高质量、可学习、可复习的笔记。重点是帮助用户理解材料、抓住概念关系、并在之后高效回顾。"
      : "Generate high-quality notes that someone could genuinely study from later. Focus on understanding, concept relationships, and long-term review value.",
    "",
    language === "zh"
      ? "请直接输出结构化笔记文档，不要输出提示解释。"
      : "Return the structured note document directly with no prompt commentary.",
    "",
    "SOURCE:",
    text,
  ].join("\n");
}

export function buildStagedMergeSystemPrompt(maxItems: number, language: "en" | "zh") {
  return [
    "You are a high-quality note editor.",
    "You are merging chunk-level notes into one coherent final note document.",
    "Rebuild the hierarchy and remove duplication instead of concatenating chunks.",
    sharedQualityRules(language, maxItems),
    markdownDocumentRules(),
  ].join("\n\n");
}

export function buildStagedMergeUserPrompt(chunkNotes: string[], language: "en" | "zh") {
  return [
    language === "zh"
      ? "请将以下分段笔记整合为一份最终高质量笔记。统一标题、摘要、知识点分组、术语、结论和复习辅助内容。"
      : "Merge the staged notes below into one final high-quality note. Unify the title, summary, concept grouping, terms, takeaways, and study aids.",
    "",
    chunkNotes.map((note, index) => `--- Chunk ${index + 1}/${chunkNotes.length} ---\n${note}`).join("\n\n"),
  ].join("\n");
}

export function buildLegacyPartSummarizerPrompt(language: "en" | "zh") {
  return [
    "You are preparing one source chunk for later note synthesis.",
    sharedQualityRules(language),
    "Output plain text only.",
    "For this chunk, provide:",
    "1. A brief statement of the chunk's main topic.",
    "2. The key concepts or rules with short explanations.",
    "3. Important examples, distinctions, or definitions when relevant.",
    "4. Useful review cues only if they add study value.",
    "Write so the chunk can later be merged into a coherent note document.",
  ].join("\n\n");
}

export function buildLegacyFinalWriterPrompt(language: "en" | "zh") {
  return [
    "You are writing the final AI Note output.",
    sharedQualityRules(language),
    markdownDocumentRules(),
  ].join("\n\n");
}

export function outlinePrompt(rawText: string) {
  return [
    {
      role: "system" as const,
      content: [
        "You are a careful note-structuring assistant.",
        "Output STRICT JSON only. No markdown, no commentary.",
        "Your job is to identify the real learning structure of the source, not to dump extraction fragments.",
        "If the source sounds like a quiz, review game, answer reveal, or assessment, still organize it as study notes first.",
        sharedQualityRules("auto"),
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `
Task:
1) Read the transcript/text and infer a clean useful title.
2) Detect the dominant source type: "lecture", "meeting", "quiz_review", "study_material", or "general".
3) Build a logical outline for real notes, grouped by themes and knowledge points.
4) Each section must include:
   - heading
   - 1-2 sentence summary
   - 3-6 keyPoints with meaningful concept/rule labels
   - sourceText: the exact excerpt from the original text that belongs to this section

Rules:
- Prefer understanding over extraction.
- Prefer themes, ideas, relationships, definitions, distinctions, and examples over timestamps or answer-key fragments.
- If the source is quiz-like, organize sections around concepts being tested, patterns, mistakes, rules, and facts implied by the answers.
- Keep each knowledge point distinct and grouped under the right section.
- Do not invent missing information.
- Output MUST be valid JSON matching this TypeScript shape:

type OutlineResult = {
  title: string;
  language: "en" | "zh" | "auto";
  sourceType: "lecture" | "meeting" | "quiz_review" | "study_material" | "general";
  sections: Array<{
    id: string;
    heading: string;
    summary: string;
    keyPoints: string[];
    sourceText: string;
  }>;
};

- Use 4 to 12 sections depending on length.
- Keep sourceText per section reasonably sized and grounded in the source.
- If input is mixed language, language="auto".
- Internally verify the outline would support a useful study note document later.

INPUT TEXT:
"""${rawText}"""
`,
    },
  ];
}

export function sectionNotesPrompt(section: {
  id: string;
  heading: string;
  sourceText: string;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "You are a study-note writer.",
        "Output STRICT JSON only. No markdown.",
        "Write useful notes someone could study from a week later.",
        "Do not produce shallow extraction fragments.",
        "Do not default to answer-key formatting.",
        sharedQualityRules("auto"),
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `
Generate study notes for ONE section.

Output MUST be valid JSON matching:

type SectionNotes = {
  id: string;
  heading: string;
  bullets: string[];
  keyTerms: Array<{ term: string; definition: string }>;
  examples: string[];
  actionItems: string[];
};

Interpretation rules:
- bullets = the core explanatory notes for this section, not raw extraction.
- Each bullet should explain a concept, distinction, rule, implication, or important detail.
- Keep bullets concise but meaningful. Avoid one-word labels and avoid transcript paraphrase.
- keyTerms should contain only genuinely important terms from the source.
- examples should include important examples, scenarios, or comparisons when relevant.
- actionItems should be used as study aids: review questions, self-check prompts, confusion points, or next-step reminders. Leave empty if not relevant.
- If the source appears quiz-like, convert answer fragments into concept-oriented notes first. Do not let answer lists dominate.
- Do not invent details.
- Internally verify the result has meaningful study value and a coherent topic.

SECTION:
id: ${section.id}
heading: ${section.heading}

SOURCE TEXT:
"""${section.sourceText}"""
`,
    },
  ];
}

export function finalMergePrompt(args: {
  title: string;
  sourceType?: string;
  sections: Array<{
    heading: string;
    summary: string;
    keyPoints: string[];
    notes: SectionNotes | null;
  }>;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "You are a premium note editor.",
        "Output STRICT JSON only. No extra text outside JSON.",
        "Your job is to turn section-level material into final study/useful notes.",
        "Prioritize understanding, hierarchy, and review value over extraction.",
        "If the source is quiz-like, transform it into study notes first; if an answer key is recoverable, place it in a separate section so it does not dominate.",
        sharedQualityRules("auto"),
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `
Merge all section notes into one polished final note.

Output MUST be valid JSON matching:

type FinalNote = {
  title: string;
  executiveSummary: string[];
  sections: Array<{ heading: string; bullets: string[] }>;
  keyTerms: Array<{ term: string; definition: string }>;
  takeaways: string[];
  studyAids: Array<{ label: string; items: string[] }>;
  answerKey: string[];
  markdown: string;
};

Requirements:
- Infer a clean title if needed.
- executiveSummary: 3-6 sentences max, concise but meaningful.
- sections: structured main notes grouped by themes; each heading should contain useful subpoints, not fragment dumps.
- keyTerms: only relevant terms, defined clearly.
- takeaways: concise review-oriented recap.
- studyAids: include only useful items such as review questions, self-check prompts, quick flashcards, memory hooks, or common confusion points.
- answerKey: keep empty unless the source is clearly quiz/review-like AND concrete answers are extractable.
- Avoid filler, transcript repetition, decorative formatting, and wall-of-text output.
- Avoid long answer-only lists unless explicitly supported by the source, and even then keep them separated.
- Clearly separate uncertain inferences from supported content.

Formatting requirements for markdown:
- Use markdown-like structure with these sections when relevant:
  # Title
  ## Executive Summary
  ## Key Concepts
  ## Main Notes
  ## Important Terms
  ## Takeaways
  ## Study Aids
  ## Answer Key / Extracted Answers
- Under Main Notes, use clear section headings and subpoints so each knowledge point feels distinct.
- Use bullets only where useful.
- Use short explanatory paragraphs where explanation is needed.
- Keep the note document readable, segmented, and easy to scan or study from.
- Optional labels such as STAR Important, Concept, LIGHTNING Tip, Example, and Warning may appear naturally inside sections, but they should not dominate the output.
- Before finalizing, internally verify the markdown includes a clear main topic, coherent summary, organized sections, meaningful study value, and no over-dominant answer list unless explicitly requested.

DATA:
title: ${args.title}
sourceType: ${args.sourceType ?? "general"}

sections JSON:
${JSON.stringify(args.sections, null, 2)}
`,
    },
  ];
}
