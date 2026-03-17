import { callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";
import { buildDirectNoteSystemPrompt, buildDirectNoteUserPrompt } from "@/lib/aiNote/prompts";

const OPENROUTER_CANDIDATES = [
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "openrouter/free",
];

export async function generateStructuredNotes(input: {
  text: string;
  isZh: boolean;
  maxItems: number;
  maxOutputTokens?: number;
}) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("MISSING_GROQ_API_KEY");

  const openrouterKey = process.env.OPENROUTER_API_KEY || undefined;
  const language = input.isZh ? "zh" : "en";
  const messages: ChatMessage[] = [
    { role: "system", content: buildDirectNoteSystemPrompt(input.maxItems, language) },
    { role: "user", content: buildDirectNoteUserPrompt(input.text, language) },
  ];

  if (openrouterKey) {
    for (const modelId of OPENROUTER_CANDIDATES) {
      try {
        const out = await callOpenRouterChat({
          apiKey: openrouterKey,
          modelId,
          messages,
          maxTokens: input.maxOutputTokens ?? 1200,
          temperature: 0.2,
        });
        return {
          note: out.content.trim(),
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
    maxTokens: input.maxOutputTokens ?? 1200,
    temperature: 0.2,
  });

  return {
    note: out.content.trim(),
    provider: "groq" as const,
    model: out.modelUsed,
  };
}
