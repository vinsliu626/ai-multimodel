import type { OutlineResult, SectionNotes, FinalNote } from "./types";

/**
 * 你的“像 StudyX”的关键：
 * - Step1 只做结构拆分（JSON）
 * - Step2 按 section 生成笔记（JSON）
 * - Step3 合并成产品化 markdown（最终输出）
 */

export function outlinePrompt(rawText: string) {
  return [
    {
      role: "system" as const,
      content:
        "You are a careful note-structuring assistant. Output STRICT JSON only. No markdown, no commentary.",
    },
    {
      role: "user" as const,
      content: `
Task:
1) Read the transcript/text.
2) Produce a clean outline with sections.
3) Each section must include:
   - heading
   - 1-sentence summary
   - 3-6 keyPoints (short bullets)
   - sourceText: the exact excerpt from the original text that belongs to this section (keep it reasonably sized; split if too long)

Rules:
- Output MUST be valid JSON matching this TypeScript shape:

type OutlineResult = {
  title: string;
  language: "en" | "zh" | "auto";
  sections: Array<{
    id: string;
    heading: string;
    summary: string;
    keyPoints: string[];
    sourceText: string;
  }>;
};

- Use 4 to 12 sections depending on length.
- Keep sourceText per section not crazy long (prefer ~800-1500 chars).
- If input is mixed language, language="auto".

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
      content:
        "You are a study-note writer. Output STRICT JSON only, no markdown. Be accurate; do not invent details.",
    },
    {
      role: "user" as const,
      content: `
Generate study notes for ONE section.

Output MUST be valid JSON matching:

type SectionNotes = {
  id: string;
  heading: string;
  bullets: string[];                 // 5-10 bullets
  keyTerms: Array<{ term: string; definition: string }>; // 3-8
  examples: string[];                // 0-5
  actionItems: string[];             // 0-5 (if applicable)
};

Constraints:
- bullets should be concise and useful for learning.
- keyTerms must be grounded in the text.
- If the text has no examples/action items, return empty arrays.

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
  sections: Array<{
    heading: string;
    summary: string;
    keyPoints: string[];
    notes: SectionNotes;
  }>;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You are a premium study-notes formatter. Output BOTH: (1) strict JSON, (2) a markdown field inside it. No extra text outside JSON.",
    },
    {
      role: "user" as const,
      content: `
Merge all section notes into a polished, product-like study note.

Output MUST be valid JSON matching:

type FinalNote = {
  title: string;
  tldr: string[]; // 5-10 bullets
  outline: Array<{ heading: string; bullets: string[] }>;
  keyTerms: Array<{ term: string; definition: string }>;
  reviewChecklist: string[]; // 8-15
  quiz: Array<{ q: string; a: string }>; // 6-12
  markdown: string; // A nicely formatted Markdown document containing all of the above
};

Formatting requirements for markdown:
- Start with "# {title}"
- Then "## TL;DR"
- Then "## Outline & Notes" with sections
- Then "## Key Terms"
- Then "## Review Checklist"
- Then "## Self-Quiz"
- Keep it clean and copy-friendly.

DATA:
title: ${args.title}

sections JSON:
${JSON.stringify(args.sections, null, 2)}
`,
    },
  ];
}
