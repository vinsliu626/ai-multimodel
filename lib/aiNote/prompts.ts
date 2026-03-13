import type { SectionNotes } from "./types";

export function outlinePrompt(rawText: string) {
  return [
    {
      role: "system" as const,
      content: "You are a careful note-structuring assistant. Output STRICT JSON only. No markdown, no commentary.",
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
   - 3-6 keyPoints
   - sourceText: the exact excerpt from the original text that belongs to this section

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
- Keep sourceText per section reasonably sized.
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
      content: "You are a study-note writer. Output STRICT JSON only, no markdown. Be accurate; do not invent details.",
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

Constraints:
- bullets should be concise, useful for learning, and short.
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
      content: "You are a premium study-notes formatter. Output BOTH: (1) strict JSON, (2) a markdown field inside it. No extra text outside JSON.",
    },
    {
      role: "user" as const,
      content: `
Merge all section notes into a polished study note.

Output MUST be valid JSON matching:

type FinalNote = {
  title: string;
  tldr: string[];
  outline: Array<{ heading: string; bullets: string[] }>;
  keyTerms: Array<{ term: string; definition: string }>;
  reviewChecklist: string[];
  quiz: Array<{ q: string; a: string }>;
  markdown: string;
};

Formatting requirements for markdown:
- The markdown field must actually be clean structured plain text.
- Do not use markdown bullets, ### headings, or *** markers.
- Use emoji markers for structure:
  ⭐ Important: ...
  📘 Concept: ...
  ⚡ Tip: ...
  🧪 Example: ...
  ⚠️ Warning: ...
- Keep each item short and readable.
- Prefer short sections separated by blank lines instead of raw markdown lists.

DATA:
title: ${args.title}

sections JSON:
${JSON.stringify(args.sections, null, 2)}
`,
    },
  ];
}
