import { callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";
import { normalizeAiText } from "@/lib/ui/aiTextFormat";

const OPENROUTER_CANDIDATES = [
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "openrouter/free",
];

function noteSystemPrompt(maxItems: number) {
  return [
    "You are a premium study-note assistant.",
    "Return clean structured plain text only. No preamble or meta commentary.",
    "Do not use markdown bullets, markdown headings, or *** markers.",
    `Keep the total number of structured items within ${maxItems}.`,
    "Use emoji markers for structure:",
    "⭐ Important: ...",
    "📘 Concept: ...",
    "⚡ Tip: ...",
    "🧪 Example: ...",
    "⚠️ Warning: ...",
    "Keep answers readable, concise, and grounded in the source text.",
  ].join("\n");
}

function noteUserPrompt(text: string) {
  return `Generate structured study notes from the text below.\n\n${text}`;
}

function clipStructuredItems(output: string, maxItems: number) {
  const lines = normalizeAiText(output).split(/\r?\n/);
  let itemCount = 0;

  return lines
    .filter((line) => {
      const trimmed = line.trim();
      const isItem = /^[⭐📘⚡🧪⚠️]/u.test(trimmed);
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
    { role: "system", content: noteSystemPrompt(input.maxItems) },
    { role: "user", content: noteUserPrompt(input.text) },
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
          note: clipStructuredItems(out.content, input.maxItems),
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
    note: clipStructuredItems(out.content, input.maxItems),
    provider: "groq" as const,
    model: out.modelUsed,
  };
}
