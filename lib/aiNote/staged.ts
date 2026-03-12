import { callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";
import { parseEnvInt } from "@/lib/env/number";
import { generateStructuredNotes } from "@/lib/aiNote/generate";

export type NoteGenerationMeta = {
  provider: "openrouter" | "groq";
  model: string;
  mode: "single" | "staged";
  chunkCount: number;
  inputChars: number;
};

export type NoteGenerationResult = {
  note: string;
  meta: NoteGenerationMeta;
};

const MERGE_CANDIDATES = [
  "google/gemma-3-27b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "google/gemma-3-12b-it:free",
  "openrouter/free",
];

function splitTextForStage(text: string, maxChars: number, overlap: number) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let cursor = 0;
  const safeOverlap = Math.max(0, Math.min(overlap, maxChars - 1));

  while (cursor < normalized.length) {
    const hardEnd = Math.min(normalized.length, cursor + maxChars);
    let end = hardEnd;

    if (hardEnd < normalized.length) {
      const paragraphCut = normalized.lastIndexOf("\n\n", hardEnd);
      const lineCut = normalized.lastIndexOf("\n", hardEnd);
      const sentenceCut = Math.max(
        normalized.lastIndexOf(". ", hardEnd),
        normalized.lastIndexOf("? ", hardEnd),
        normalized.lastIndexOf("! ", hardEnd)
      );
      const preferred = [paragraphCut, lineCut, sentenceCut].find((idx) => idx > cursor + Math.floor(maxChars * 0.55));
      if (preferred) {
        end = preferred + 1;
      }
    }

    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;

    const nextCursor = Math.max(end - safeOverlap, cursor + 1);
    cursor = nextCursor;
  }

  return chunks;
}

async function mergeChunkNotes(opts: {
  chunkNotes: string[];
  isZh: boolean;
  maxItems: number;
  maxOutputTokens: number;
}) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("MISSING_GROQ_API_KEY");

  const openrouterKey = process.env.OPENROUTER_API_KEY || undefined;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: opts.isZh
        ? [
            "你是高级学习笔记整理助手。",
            "你会把多段阶段性笔记合并成一份最终高质量 Markdown 笔记。",
            `总条目数控制在 ${opts.maxItems} 以内。`,
            "必须包含这些标题：",
            "## TL;DR",
            "## Key Points",
            "## Action Items",
            "## Review Checklist",
            "规则：去重；不要编造事实；保留重要数字和负责人；不确定写 (unclear)。",
          ].join("\n")
        : [
            "You are a premium study-note assistant.",
            "Merge staged chunk notes into one final Markdown note.",
            `Keep the total bullet/item count within ${opts.maxItems}.`,
            "Required headings:",
            "## TL;DR",
            "## Key Points",
            "## Action Items",
            "## Review Checklist",
            "Rules: deduplicate, keep important numbers and owners, do not invent facts, mark uncertainty as (unclear).",
          ].join("\n"),
    },
    {
      role: "user",
      content: [
        opts.isZh ? "请将以下分段笔记合并为最终笔记：" : "Merge the staged notes below into final notes:",
        "",
        opts.chunkNotes.map((note, index) => `--- Chunk ${index + 1}/${opts.chunkNotes.length} ---\n${note}`).join("\n\n"),
      ].join("\n"),
    },
  ];

  if (openrouterKey) {
    for (const modelId of MERGE_CANDIDATES) {
      try {
        const out = await callOpenRouterChat({
          apiKey: openrouterKey,
          modelId,
          messages,
          maxTokens: opts.maxOutputTokens,
          temperature: 0.15,
        });
        return { note: out.content.trim(), provider: "openrouter" as const, model: out.modelUsed };
      } catch (error) {
        if (!shouldFallback(error)) throw error;
      }
    }
  }

  const out = await callGroqChat({
    apiKey: groqKey,
    modelId: process.env.AI_NOTE_TEXT_MODEL || "llama-3.3-70b-versatile",
    messages,
    maxTokens: opts.maxOutputTokens,
    temperature: 0.15,
  });

  return { note: out.content.trim(), provider: "groq" as const, model: out.modelUsed };
}

export function getStagedNoteMaxChars() {
  return Math.max(12_000, parseEnvInt("AI_NOTE_STAGED_MAX_INPUT_CHARS", 60_000));
}

export async function generateStructuredNotesSafely(input: {
  text: string;
  isZh: boolean;
  maxItems: number;
  maxOutputTokens?: number;
  preferStaged?: boolean;
}) : Promise<NoteGenerationResult> {
  const normalizedText = input.text.trim();
  const inputChars = normalizedText.length;
  const maxOutputTokens = input.maxOutputTokens ?? 1_000;
  const stagedThreshold = Math.max(6_000, parseEnvInt("AI_NOTE_STAGED_TRIGGER_CHARS", 10_000));
  const chunkChars = Math.max(3_500, parseEnvInt("AI_NOTE_STAGED_CHUNK_CHARS", 6_000));
  const overlap = Math.max(160, parseEnvInt("AI_NOTE_STAGED_CHUNK_OVERLAP", 350));

  if (!input.preferStaged && inputChars <= stagedThreshold) {
    const single = await generateStructuredNotes({
      text: normalizedText,
      isZh: input.isZh,
      maxItems: input.maxItems,
      maxOutputTokens,
    });
    return {
      note: single.note,
      meta: {
        provider: single.provider,
        model: single.model,
        mode: "single",
        chunkCount: 1,
        inputChars,
      },
    };
  }

  const chunks = splitTextForStage(normalizedText, chunkChars, overlap);
  const maxChunks = Math.max(2, parseEnvInt("AI_NOTE_STAGED_MAX_CHUNKS", 12));
  if (chunks.length > maxChunks) {
    throw new Error(`NOTE_STAGED_TOO_LARGE:${chunks.length}:${maxChunks}`);
  }

  const chunkItemCap = Math.max(5, Math.min(9, Math.ceil(input.maxItems * 0.6)));
  const chunkTokenCap = Math.min(maxOutputTokens, Math.max(550, parseEnvInt("AI_NOTE_STAGED_CHUNK_MAX_TOKENS", 700)));
  const chunkNotes: string[] = [];

  for (const chunk of chunks) {
    const partial = await generateStructuredNotes({
      text: chunk,
      isZh: input.isZh,
      maxItems: chunkItemCap,
      maxOutputTokens: chunkTokenCap,
    });
    chunkNotes.push(partial.note);
  }

  const merged = await mergeChunkNotes({
    chunkNotes,
    isZh: input.isZh,
    maxItems: input.maxItems,
    maxOutputTokens: Math.max(maxOutputTokens, parseEnvInt("AI_NOTE_STAGED_MERGE_MAX_TOKENS", 900)),
  });

  return {
    note: merged.note,
    meta: {
      provider: merged.provider,
      model: merged.model,
      mode: "staged",
      chunkCount: chunks.length,
      inputChars,
    },
  };
}
