import { callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";

const OPENROUTER_CANDIDATES = [
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "openrouter/free",
];

function noteSystemPrompt(isZh: boolean, maxItems: number) {
  return isZh
    ? [
        "你是高级学习笔记助手。",
        "输出干净的 Markdown，直接给最终结果，不要解释过程。",
        `总条目数控制在 ${maxItems} 以内。`,
        "必须包含以下标题：",
        "## TL;DR",
        "## Key Points",
        "## Action Items",
        "## Review Checklist",
        "规则：优先提炼关键点；每条尽量短；不要写长段落；不要编造事实；不确定写 (unclear)。",
      ].join("\n")
    : [
        "You are a premium study-note assistant.",
        "Return clean Markdown only. No preamble, no meta commentary.",
        `Keep the total bullet/item count within ${maxItems}.`,
        "Required headings:",
        "## TL;DR",
        "## Key Points",
        "## Action Items",
        "## Review Checklist",
        "Rules: prioritize key points over summary prose; keep each bullet short; avoid long paragraphs; do not invent facts; mark uncertainty as (unclear).",
      ].join("\n");
}

function noteUserPrompt(text: string, isZh: boolean) {
  return isZh
    ? `请根据下面内容生成结构化学习笔记：\n\n${text}`
    : `Generate structured study notes from the text below:\n\n${text}`;
}

function clipMarkdownItems(markdown: string, maxItems: number) {
  const lines = markdown.split(/\r?\n/);
  let itemCount = 0;

  return lines
    .filter((line) => {
      const trimmed = line.trim();
      const isItem = /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
      if (!isItem) return true;
      itemCount += 1;
      return itemCount <= maxItems;
    })
    .join("\n")
    .trim();
}

export async function generateStructuredNotes(input: {
  text: string;
  isZh: boolean;
  maxItems: number;
  maxOutputTokens?: number;
}) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("MISSING_GROQ_API_KEY");

  const openrouterKey = process.env.OPENROUTER_API_KEY || undefined;
  const messages: ChatMessage[] = [
    { role: "system", content: noteSystemPrompt(input.isZh, input.maxItems) },
    { role: "user", content: noteUserPrompt(input.text, input.isZh) },
  ];

  if (openrouterKey) {
    for (const modelId of OPENROUTER_CANDIDATES) {
      try {
        const out = await callOpenRouterChat({
          apiKey: openrouterKey,
          modelId,
          messages,
          maxTokens: input.maxOutputTokens ?? 1_000,
          temperature: 0.2,
        });
        return {
          note: clipMarkdownItems(out.content, input.maxItems),
          provider: "openrouter" as const,
          model: out.modelUsed,
        };
      } catch (error) {
        if (!shouldFallback(error)) throw error;
      }
    }
  }

  const out = await callGroqChat({
    apiKey: groqKey,
    modelId: process.env.AI_NOTE_TEXT_MODEL || "llama-3.3-70b-versatile",
    messages,
    maxTokens: input.maxOutputTokens ?? 1_000,
    temperature: 0.2,
  });

  return {
    note: clipMarkdownItems(out.content, input.maxItems),
    provider: "groq" as const,
    model: out.modelUsed,
  };
}
