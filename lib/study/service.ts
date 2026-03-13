import { createHash } from "crypto";
import { z } from "zod";
import { addUsageEvent } from "@/lib/billing/usage";
import { withTimeout } from "@/lib/ai/timeout";
import { normalizeAiText } from "@/lib/ui/aiTextFormat";
import { getStudyPlanLimits } from "./limits";
import type {
  StudyFlashcard,
  StudyGenerationResult,
  StudyMode,
  StudyQuizType,
  StudyQuizItem,
  StudyRequestInput,
} from "./types";

const studyModes = ["notes", "flashcards", "quiz"] as const;
const quizTypes = ["multiple_choice", "fill_blank", "matching"] as const;

const studyRequestSchema = z.object({
  extractedText: z.string().min(1).max(200_000),
  title: z.string().trim().max(160).optional(),
  selectedModes: z.array(z.enum(studyModes)).min(1).max(3),
  quizTypes: z.array(z.enum(quizTypes)).min(1).max(3).optional(),
  quizCount: z.number().int().min(1).max(30).optional(),
  flashcardCount: z.number().int().min(1).max(50).optional(),
  noteCount: z.number().int().min(1).max(30).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  fileName: z.string().trim().max(260).optional(),
  fileSizeBytes: z.number().int().min(0).max(8 * 1024 * 1024).optional(),
  mimeType: z.string().trim().max(200).optional(),
});

type ProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

type CachedStudyResult = {
  expiresAt: number;
  value: StudyGenerationResult;
};

const studyResultCache = new Map<string, CachedStudyResult>();
const STUDY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MODEL_TIMEOUT_MS = 22_000;
const REPAIR_MAX_TOKENS = 1_100;
const STUDY_PROMPT_VERSION = "2026-03-13-quiz-quality-v2";

type RawModelPayload = {
  notes?: unknown;
  flashcards?: unknown;
  quiz?: unknown;
};

type ParseStage = "first_try" | "repair_try";

type TargetCounts = {
  notes: number;
  flashcards: number;
  quiz: number;
};

export function validateStudyRequest(input: unknown) {
  return studyRequestSchema.parse(input);
}

export function sanitizeStudyText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitStudyParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const QUESTION_SIGNAL_RE =
  /\b(question|questions|exercise|exercises|practice|quiz|review|prompt|short answer|multiple choice|true false|fill in the blank|matching|match the following|sample test|study guide)\b/i;

function isQuestionFocusedParagraph(paragraph: string) {
  return QUESTION_SIGNAL_RE.test(paragraph) || /\?/.test(paragraph) || /^\s*(q(?:uestion)?\s*\d+|\d+[\).:])\s+/i.test(paragraph);
}

function paragraphScore(paragraph: string) {
  const lengthScore = paragraph.length >= 120 && paragraph.length <= 1_100 ? 2 : paragraph.length > 60 ? 1 : 0;
  const questionScore = isQuestionFocusedParagraph(paragraph) ? 5 : 0;
  const keywordScore = Math.min(4, Math.floor((paragraph.match(/[A-Za-z][A-Za-z0-9-]{4,}/g) ?? []).length / 10));
  return questionScore + lengthScore + keywordScore;
}

function trimAtSentenceBoundary(text: string, maxChars: number) {
  if (text.length <= maxChars) return text.trim();
  const slice = text.slice(0, maxChars);
  const sentenceBoundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "), slice.lastIndexOf("\n"));
  const cut = sentenceBoundary >= Math.floor(maxChars * 0.65) ? sentenceBoundary + 1 : maxChars;
  return slice.slice(0, cut).trim();
}

export function truncateStudyText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  const paragraphs = splitStudyParagraphs(text);
  if (paragraphs.length <= 1) {
    return { text: trimAtSentenceBoundary(text, maxChars), truncated: true };
  }

  const selected: string[] = [];
  const used = new Set<number>();
  let totalChars = 0;

  const pushParagraph = (index: number) => {
    if (used.has(index)) return;
    const paragraph = paragraphs[index];
    if (!paragraph) return;
    const separator = selected.length > 0 ? 2 : 0;
    if (totalChars + separator + paragraph.length > maxChars) return;
    used.add(index);
    selected.push(paragraph);
    totalChars += separator + paragraph.length;
  };

  const headBudget = Math.floor(maxChars * 0.45);
  for (let i = 0; i < paragraphs.length && totalChars < headBudget; i += 1) {
    pushParagraph(i);
  }

  const ranked = paragraphs
    .map((paragraph, index) => ({ index, score: paragraphScore(paragraph) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const item of ranked) {
    if (totalChars >= Math.floor(maxChars * 0.88)) break;
    pushParagraph(item.index);
  }

  for (let i = Math.max(0, paragraphs.length - 3); i < paragraphs.length; i += 1) {
    pushParagraph(i);
  }

  const merged = selected.join("\n\n").trim();
  return { text: merged ? trimAtSentenceBoundary(merged, maxChars) : trimAtSentenceBoundary(text, maxChars), truncated: true };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function estimateDensity(text: string) {
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (words.length === 0) return 0.35;
  const unique = new Set(words).size;
  return clamp(unique / words.length, 0.2, 0.95);
}

function countQuestionAnchors(text: string) {
  return splitStudyParagraphs(text).filter(isQuestionFocusedParagraph).length;
}

function computeTargets(input: {
  text: string;
  selectedModes: StudyMode[];
  plan: string;
  requestedQuizCount?: number;
  requestedNoteCount?: number;
  requestedFlashcardCount?: number;
  limits: ReturnType<typeof getStudyPlanLimits>;
}): TargetCounts {
  const charCount = input.text.length;
  const density = estimateDensity(input.text);
  const questionAnchors = countQuestionAnchors(input.text);
  const modeCount = input.selectedModes.length;
  const moduleMultiplier = modeCount === 1 ? 1 : modeCount === 2 ? 0.7 : 0.5;
  const minPerModule = modeCount === 1 ? 3 : 2;

  let baseNotesMin = 4;
  let baseNotesMax = 6;
  let baseFlashMin = 4;
  let baseFlashMax = 6;
  let baseQuizMin = input.plan === "basic" ? 10 : input.plan === "pro" ? 16 : 22;
  let baseQuizMax = input.plan === "basic" ? 10 : input.plan === "pro" ? 20 : 30;

  if (charCount >= 4_000 && charCount <= 12_000) {
    baseNotesMin = 6;
    baseNotesMax = 8;
    baseFlashMin = 6;
    baseFlashMax = 10;
  } else if (charCount > 12_000) {
    baseNotesMin = 6;
    baseNotesMax = Math.min(10, input.limits.maxNotes);
    baseFlashMin = 6;
    baseFlashMax = Math.min(12, input.limits.maxFlashcards);

    if (input.plan === "pro") {
      baseQuizMin = questionAnchors >= 8 ? 20 : 18;
    } else if (input.plan === "ultra") {
      baseQuizMin = questionAnchors >= 10 || density >= 0.58 ? 30 : 26;
    }
  }

  if (questionAnchors >= 6) {
    baseQuizMin = Math.max(baseQuizMin, input.plan === "basic" ? 10 : input.plan === "pro" ? 20 : 30);
  }

  baseQuizMax = Math.min(baseQuizMax, input.limits.maxQuizQuestions);
  baseQuizMin = Math.min(baseQuizMin, baseQuizMax);
  baseNotesMax = Math.min(baseNotesMax, input.limits.maxNotes);
  baseNotesMin = Math.min(baseNotesMin, baseNotesMax);
  baseFlashMax = Math.min(baseFlashMax, input.limits.maxFlashcards);
  baseFlashMin = Math.min(baseFlashMin, baseFlashMax);

  const denseBoost = density >= 0.6 ? 1 : density <= 0.38 ? 0 : 0.5;
  const interpolated = (min: number, max: number) => Math.round(min + (max - min) * denseBoost);

  const notesTarget = clamp(Math.round(interpolated(baseNotesMin, baseNotesMax) * moduleMultiplier), minPerModule, input.limits.maxNotes);
  let flashcardsTarget = clamp(
    Math.round(interpolated(baseFlashMin, baseFlashMax) * moduleMultiplier),
    minPerModule,
    input.limits.maxFlashcards
  );
  const quizTarget = clamp(
    Math.round(interpolated(baseQuizMin, baseQuizMax) * moduleMultiplier),
    minPerModule,
    input.limits.maxQuizQuestions
  );

  if (input.selectedModes.includes("quiz") && input.selectedModes.includes("flashcards")) {
    flashcardsTarget = Math.max(3, Math.floor(flashcardsTarget * 0.8));
  }

  const notes = clamp(Math.min(input.requestedNoteCount ?? notesTarget, input.limits.maxNotes), minPerModule, input.limits.maxNotes);
  const flashcards = clamp(
    Math.min(input.requestedFlashcardCount ?? flashcardsTarget, input.limits.maxFlashcards),
    minPerModule,
    input.limits.maxFlashcards
  );
  const quiz = clamp(
    Math.max(input.requestedQuizCount ?? quizTarget, baseQuizMin),
    Math.max(minPerModule, Math.min(baseQuizMin, input.limits.maxQuizQuestions)),
    input.limits.maxQuizQuestions
  );

  return {
    notes: input.selectedModes.includes("notes") ? notes : 0,
    flashcards: input.selectedModes.includes("flashcards") ? flashcards : 0,
    quiz: input.selectedModes.includes("quiz") ? quiz : 0,
  };
}

function getProviderConfigs(): ProviderConfig[] {
  const configs: ProviderConfig[] = [];

  if (process.env.GROQ_API_KEY) {
    configs.push({
      provider: "groq",
      baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    configs.push({
      provider: "deepseek",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    });
  }
  if (process.env.KIMI_API_KEY) {
    configs.push({
      provider: "kimi",
      baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
      apiKey: process.env.KIMI_API_KEY,
      model: process.env.KIMI_MODEL || "moonshot-v1-8k",
    });
  }

  return configs;
}

function buildCacheKey(
  userId: string,
  plan: string,
  payload: StudyRequestInput & {
    normalizedText: string;
    selectedModes: StudyMode[];
    selectedQuizTypes: StudyQuizType[];
    targets: TargetCounts;
  }
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        userId,
        plan,
        version: STUDY_PROMPT_VERSION,
        text: payload.normalizedText,
        selectedModes: payload.selectedModes,
        selectedQuizTypes: payload.selectedQuizTypes,
        targets: payload.targets,
        title: payload.title ?? "",
        fileName: payload.fileName ?? "",
      })
    )
    .digest("hex");
}

function readStudyCache(key: string) {
  const entry = studyResultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    studyResultCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeStudyCache(key: string, value: StudyGenerationResult) {
  studyResultCache.set(key, {
    value,
    expiresAt: Date.now() + STUDY_CACHE_TTL_MS,
  });
}

function cleanNote(note: unknown) {
  return typeof note === "string" ? normalizeAiText(note.replace(/\s+/g, " ").trim()) : "";
}

function cleanFlashcard(item: unknown): StudyFlashcard | null {
  if (!item || typeof item !== "object") return null;
  const value = item as { front?: unknown; back?: unknown };
  const front = typeof value.front === "string" ? value.front.trim() : "";
  const back = typeof value.back === "string" ? value.back.trim() : "";
  if (!front || !back) return null;
  return { front, back };
}

function normalizeOptions(options: unknown) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => (typeof option === "string" ? option.trim() : "")).filter(Boolean).slice(0, 6);
}

function uniqueQuizTypes(types: StudyQuizType[] | undefined) {
  return Array.from(new Set(types ?? []));
}

function cleanQuizItem(item: unknown): StudyQuizItem | null {
  if (!item || typeof item !== "object") return null;
  const value = item as {
    type?: unknown;
    question?: unknown;
    prompt?: unknown;
    answer?: unknown;
    options?: unknown;
    pairs?: unknown;
    explanation?: unknown;
  };

  const type = typeof value.type === "string" ? value.type.trim() : "";
  const answer = typeof value.answer === "string" ? value.answer.trim() : "";
  const explanation = typeof value.explanation === "string" ? value.explanation.trim() : undefined;

  if (type === "multiple_choice") {
    const question = typeof value.question === "string" ? value.question.trim() : "";
    const options = normalizeOptions(value.options);
    if (!question || !answer || options.length < 2) return null;
    return { type, question, options, answer, explanation };
  }

  if (type === "fill_blank") {
    const question = typeof value.question === "string" ? value.question.trim() : "";
    if (!question || !answer) return null;
    return { type, question, answer, explanation };
  }

  if (type === "matching") {
    const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
    const pairsRaw = Array.isArray(value.pairs) ? value.pairs : [];
    const pairs = pairsRaw
      .map((pair) => {
        if (!pair || typeof pair !== "object") return null;
        const p = pair as { left?: unknown; right?: unknown };
        const left = typeof p.left === "string" ? p.left.trim() : "";
        const right = typeof p.right === "string" ? p.right.trim() : "";
        if (!left || !right) return null;
        return { left, right };
      })
      .filter((pair): pair is { left: string; right: string } => Boolean(pair))
      .slice(0, 6);

    if (!prompt || pairs.length < 2) return null;
    return { type, prompt, pairs, explanation };
  }

  return null;
}

async function callStudyModelRaw(
  config: ProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens: number
) {
  const { controller, cancel } = withTimeout(MODEL_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `${config.provider} request failed (${res.status})`);
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content || typeof content !== "string") {
      throw new Error(`${config.provider} returned empty content`);
    }

    return {
      provider: config.provider,
      model: config.model,
      content: content.trim(),
    };
  } finally {
    cancel();
  }
}

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseRawPayload(content: string): RawModelPayload {
  const candidates = [content.trim(), stripCodeFences(content)];
  const extracted = extractFirstJsonObject(candidates[1]);
  if (extracted) candidates.push(extracted);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      const parsed = JSON.parse(normalized);
      if (parsed && typeof parsed === "object") {
        return parsed as RawModelPayload;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Invalid JSON payload");
}

function normalizeStudyPayload(
  payload: RawModelPayload,
  selectedModes: StudyMode[],
  targets: TargetCounts,
  allowedQuizTypes: Set<StudyQuizType>
) {
  const notes = selectedModes.includes("notes")
    ? Array.isArray(payload.notes)
      ? payload.notes.map(cleanNote).filter(Boolean).slice(0, targets.notes)
      : []
    : undefined;

  const flashcards = selectedModes.includes("flashcards")
    ? Array.isArray(payload.flashcards)
      ? payload.flashcards.map(cleanFlashcard).filter((item): item is StudyFlashcard => Boolean(item)).slice(0, targets.flashcards)
      : []
    : undefined;

  const quiz = selectedModes.includes("quiz")
    ? Array.isArray(payload.quiz)
      ? payload.quiz
          .map(cleanQuizItem)
          .filter((item): item is StudyQuizItem => Boolean(item))
          .filter((item) => allowedQuizTypes.has(item.type))
          .slice(0, targets.quiz)
      : []
    : undefined;

  return { notes, flashcards, quiz };
}

function buildRepairPrompt(input: {
  malformedOutput: string;
  selectedModes: StudyMode[];
  allowedQuizTypes: StudyQuizType[];
  targets: TargetCounts;
}) {
  const sectionRules = [
    input.selectedModes.includes("notes") ? `- notes: string[] (up to ${input.targets.notes})` : "- notes: omit",
    input.selectedModes.includes("flashcards")
      ? `- flashcards: [{front: string, back: string}] (up to ${input.targets.flashcards})`
      : "- flashcards: omit",
    input.selectedModes.includes("quiz")
      ? `- quiz: [{type: ${input.allowedQuizTypes.map((t) => `\"${t}\"`).join("|")}, ...}] (up to ${input.targets.quiz})`
      : "- quiz: omit",
  ].join("\n");

  return [
    "Repair the following output into valid JSON only.",
    "Return ONE raw JSON object. No markdown. No explanation.",
    "Allowed keys: notes, flashcards, quiz.",
    sectionRules,
    "Quiz quality: standard study/exam review. No trivial filler.",
    "Malformed output:",
    input.malformedOutput,
  ].join("\n");
}

function buildStudyPrompt(input: {
  text: string;
  title?: string;
  selectedModes: StudyMode[];
  selectedQuizTypes: StudyQuizType[];
  targets: TargetCounts;
}) {
  const header = input.title ? `Document title: ${input.title}\n` : "";

  const modeInstructions = [
    input.selectedModes.includes("notes")
      ? `notes: produce up to ${input.targets.notes} concise, high-signal bullets (no filler).`
      : "Do not return notes.",
    input.selectedModes.includes("flashcards")
      ? `flashcards: produce up to ${input.targets.flashcards} items with {front, back}.`
      : "Do not return flashcards.",
    input.selectedModes.includes("quiz")
      ? `quiz: produce up to ${input.targets.quiz} items using ONLY these types: ${input.selectedQuizTypes.join(", ")}. Keep answers short and document-specific.`
      : "Do not return quiz.",
  ].join("\n");

  return [
    "Use only the document text. Do not add outside facts.",
    "Return ONE raw JSON object only. No markdown fences. No extra text.",
    "Do not use markdown bullets, markdown headings, or *** markers inside note strings.",
    "When returning notes strings, use emoji markers such as ⭐ Important:, 📘 Concept:, ⚡ Tip:, 🧪 Example:, and ⚠️ Warning:.",
    "If a mode is not requested, omit that key entirely.",
    "Quiz quality target: standard study/exam review. Not trivial, not overly hard.",
    "If the document includes explicit questions, exercises, review prompts, or worked examples, prioritize those as quiz anchors first.",
    "Favor concept checks, applied understanding, definitions, relationships, comparisons, cause/effect, and likely test-style prompts.",
    "Do not turn headings into shallow questions. Do not invent filler just to reach the target count.",
    "Quiz schema:",
    '{"type":"multiple_choice","question":string,"options":string[],"answer":string,"explanation"?:string}',
    '{"type":"fill_blank","question":string,"answer":string,"explanation"?:string}',
    '{"type":"matching","prompt":string,"pairs":[{"left":string,"right":string}],"explanation"?:string}',
    modeInstructions,
    "Avoid duplicate or repetitive items across sections.",
    "",
    `${header}Document text:`,
    input.text,
  ].join("\n");
}

function computeModelMaxTokens(targets: TargetCounts) {
  const estimated = 1_200 + targets.notes * 70 + targets.flashcards * 55 + targets.quiz * 85;
  return clamp(estimated, 1_500, 3_400);
}

export async function generateStudyContent(params: {
  userId: string;
  plan: string;
  input: StudyRequestInput;
}) {
  const parsed = validateStudyRequest(params.input);
  const limits = getStudyPlanLimits(params.plan);

  const selectedModes = Array.from(new Set(parsed.selectedModes));
  if (selectedModes.length > limits.maxSelectableModes) {
    throw new Error(`Selected modes exceed plan limit (${limits.maxSelectableModes}).`);
  }

  const normalizedText = sanitizeStudyText(parsed.extractedText);
  const { text: boundedText, truncated } = truncateStudyText(normalizedText, limits.maxExtractedChars);

  const requestedQuizTypes = uniqueQuizTypes(parsed.quizTypes);
  if (selectedModes.includes("quiz") && requestedQuizTypes.length === 0) {
    throw new Error("At least one quiz type is required when quiz mode is selected.");
  }

  const allowMatchingForSize = boundedText.length >= 5_000 || estimateDensity(boundedText) >= 0.55;
  const selectedQuizTypes =
    selectedModes.includes("quiz")
      ? requestedQuizTypes.includes("matching") && !allowMatchingForSize && requestedQuizTypes.length > 1
        ? requestedQuizTypes.filter((type) => type !== "matching")
        : requestedQuizTypes
      : [];
  const allowedQuizTypes = new Set<StudyQuizType>(selectedQuizTypes);

  const targets = computeTargets({
    text: boundedText,
    selectedModes,
    plan: params.plan,
    requestedQuizCount: parsed.quizCount,
    requestedNoteCount: parsed.noteCount,
    requestedFlashcardCount: parsed.flashcardCount,
    limits,
  });

  const cacheKey = buildCacheKey(params.userId, params.plan, {
    ...parsed,
    normalizedText: boundedText,
    selectedModes,
    selectedQuizTypes,
    targets,
  });
  const cached = readStudyCache(cacheKey);
  if (cached) {
    return {
      result: {
        ...cached,
        meta: { ...cached.meta, cached: true },
      },
      cached: true,
      usedCharCount: boundedText.length,
      originalCharCount: normalizedText.length,
      truncated,
    };
  }

  const providers = getProviderConfigs();
  if (providers.length === 0) {
    throw new Error("No AI provider configured. Set GROQ_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY.");
  }

  const messages = [
    {
      role: "system" as const,
      content: "Generate structured study outputs from provided text. Return a single valid JSON object only.",
    },
    {
      role: "user" as const,
      content: buildStudyPrompt({
        text: boundedText,
        title: parsed.title,
        selectedModes,
        selectedQuizTypes,
        targets,
      }),
    },
  ];

  let lastError: Error | null = null;
  for (const provider of providers) {
    let rawOutputLength = 0;
    try {
      const response = await callStudyModelRaw(provider, messages, computeModelMaxTokens(targets));
      rawOutputLength = response.content.length;

      let parseStage: ParseStage = "first_try";
      let notes: string[] | undefined;
      let flashcards: StudyFlashcard[] | undefined;
      let quiz: StudyQuizItem[] | undefined;

      try {
        const payload = parseRawPayload(response.content);
        const normalized = normalizeStudyPayload(payload, selectedModes, targets, allowedQuizTypes);
        notes = normalized.notes;
        flashcards = normalized.flashcards;
        quiz = normalized.quiz;
      } catch {
        parseStage = "repair_try";
        const repairMessages = [
          {
            role: "system" as const,
            content: "You repair malformed JSON. Return raw valid JSON only.",
          },
          {
            role: "user" as const,
            content: buildRepairPrompt({
              malformedOutput: response.content,
              selectedModes,
              allowedQuizTypes: selectedQuizTypes,
              targets,
            }),
          },
        ];
        const repaired = await callStudyModelRaw(provider, repairMessages, REPAIR_MAX_TOKENS);
        const payload = parseRawPayload(repaired.content);
        const normalized = normalizeStudyPayload(payload, selectedModes, targets, allowedQuizTypes);
        notes = normalized.notes;
        flashcards = normalized.flashcards;
        quiz = normalized.quiz;
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug("[study.service] parse summary", {
          provider: provider.provider,
          rawOutputLength,
          parseStage,
          notesCount: notes?.length ?? 0,
          flashcardsCount: flashcards?.length ?? 0,
          quizCount: quiz?.length ?? 0,
          selectedModes,
          targets,
        });
      }

      const hasAny =
        (notes && notes.length > 0) ||
        (flashcards && flashcards.length > 0) ||
        (quiz && quiz.length > 0);

      if (!hasAny) {
        throw new Error(`${provider.provider} returned incomplete study JSON`);
      }

      const result: StudyGenerationResult = {
        ...(selectedModes.includes("notes") ? { notes: notes ?? [] } : {}),
        ...(selectedModes.includes("flashcards") ? { flashcards: flashcards ?? [] } : {}),
        ...(selectedModes.includes("quiz") ? { quiz: quiz ?? [] } : {}),
        meta: {
          selectedModes,
          selectedQuizTypes: selectedModes.includes("quiz") ? selectedQuizTypes : undefined,
          generatedCounts: {
            ...(selectedModes.includes("notes") ? { notes: notes?.length ?? 0 } : {}),
            ...(selectedModes.includes("flashcards") ? { flashcards: flashcards?.length ?? 0 } : {}),
            ...(selectedModes.includes("quiz") ? { quiz: quiz?.length ?? 0 } : {}),
          },
          truncated,
          originalCharCount: normalizedText.length,
          usedCharCount: boundedText.length,
          cached: false,
          title: parsed.title?.trim() || undefined,
          provider: response.provider,
          model: response.model,
        },
      };

      writeStudyCache(cacheKey, result);
      await addUsageEvent(params.userId, "study_count", 1);

      return {
        result,
        cached: false,
        usedCharCount: boundedText.length,
        originalCharCount: normalizedText.length,
        truncated,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[study.service] provider failed", {
          provider: provider.provider,
          rawOutputLength,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error("Study generation failed.");
}
