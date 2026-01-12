import { z } from "zod";
import { outlinePrompt, sectionNotesPrompt, finalMergePrompt } from "./prompts";

// 兼容你 types 里可能叫 OutLineResult（截图就是 OutLineResult）
// 如果你 types.ts 实际叫 OutlineResult，也能工作（看下面的 import 写法）
import type {
  OutlineSection as OutlineResult,
  SectionNotes,
  FinalNote,
} from "./types";

// ✅ 关键：不用 @/，改用相对路径，彻底消灭红线（不依赖 tsconfig paths）
import { callGroqChat } from "@/lib/ai/providers/groq";
import { callHfRouterChat } from "@/lib/ai/providers/hfRouter";

const FAST_MODEL = "llama-3.1-8b-instant";

// 复用你 chat 后端用的 HF 模型
const HF_DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";
const HF_KIMI_MODEL = "moonshotai/Kimi-K2-Instruct-0905";

/** ===================== JSON Schemas ===================== */
const OutlineSchema = z.object({
  title: z.string().min(1),
  language: z.enum(["en", "zh", "auto"]).default("auto"),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        heading: z.string().min(1),
        summary: z.string().min(1),
        keyPoints: z.array(z.string().min(1)).min(2),
        sourceText: z.string().min(20),
      })
    )
    .min(1),
});

const SectionNotesSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(5).max(10),
  keyTerms: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .min(3)
    .max(8),
  examples: z.array(z.string().min(1)).max(5),
  actionItems: z.array(z.string().min(1)).max(5),
});

const FinalNoteSchema = z.object({
  title: z.string().min(1),
  tldr: z.array(z.string().min(1)).min(2).max(8),
  outline: z
    .array(
      z.object({
        heading: z.string().min(1),
        bullets: z.array(z.string().min(1)).min(2),
      })
    )
    .min(1),
  keyTerms: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .min(3),
  reviewChecklist: z.array(z.string().min(1)).min(3).max(12),
  quiz: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).min(3).max(10),
  markdown: z.string().min(20),
});

/** ===================== Helpers ===================== */
function normalizeInput(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function stripCodeFences(s: string) {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

function stripThinkBlocks(s: string) {
  // DeepSeek/R1 常见：<think>...</think>
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractFirstJsonObject(s: string) {
  const text = s.trim();
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inStr = false;
      continue;
    } else {
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}") depth--;

      if (depth === 0) {
        return text.slice(firstBrace, i + 1);
      }
    }
  }
  return null;
}

function parseJsonFromModel<T>(raw: string): T {
  let t = raw.trim();
  t = stripCodeFences(t);
  t = stripThinkBlocks(t);

  // 1) 直接 parse
  try {
    return JSON.parse(t) as T;
  } catch {}

  // 2) 抽取第一个 {...}
  const obj = extractFirstJsonObject(t);
  if (obj) {
    try {
      return JSON.parse(obj) as T;
    } catch {}
  }

  throw new Error(`Failed to parse JSON from model:\n${raw}`);
}

/** ===================== Robust Section Notes (retry once) ===================== */
async function callSectionNotesRobust(args: {
  hfToken: string;
  id: string;
  heading: string;
  sourceText: string;
}): Promise<SectionNotes> {
  const { hfToken, id, heading, sourceText } = args;

  // 第一次：正常 prompt
  const raw1 = await callHfRouterChat(
    hfToken,
    HF_DEEPSEEK_MODEL,
    sectionNotesPrompt({ id, heading, sourceText }),
    { temperature: 0 }
  );

  try {
    const obj1 = parseJsonFromModel<SectionNotes>(raw1);
    const parsed1 = SectionNotesSchema.safeParse(obj1);
    if (!parsed1.success) throw new Error("SectionNotes schema mismatch");
    return parsed1.data;
  } catch {
    // 第二次：更狠，强制只输出 JSON
    const hardMessages = [
      {
        role: "system" as const,
        content: [
          "Return ONLY valid JSON.",
          "Do NOT output <think> tags, reasoning, markdown, or any extra text.",
          "If you previously output anything else, output JSON only now.",
        ].join("\n"),
      },
      {
        role: "user" as const,
        content: [
          `Output ONLY this JSON shape:`,
          `{`,
          `  "id": "${id}",`,
          `  "heading": "${heading}",`,
          `  "bullets": ["..."],`,
          `  "keyTerms": [{"term": "...", "definition": "..."}],`,
          `  "examples": [],`,
          `  "actionItems": []`,
          `}`,
          ``,
          `Constraints:`,
          `- bullets: 5-10`,
          `- keyTerms: 3-8`,
          `- examples: 0-5`,
          `- actionItems: 0-5`,
          ``,
          `Source text:`,
          sourceText,
        ].join("\n"),
      },
    ];

    const raw2 = await callHfRouterChat(hfToken, HF_DEEPSEEK_MODEL, hardMessages, {
      temperature: 0,
    });

    const obj2 = parseJsonFromModel<SectionNotes>(raw2);
    const parsed2 = SectionNotesSchema.safeParse(obj2);
    if (!parsed2.success) {
      throw new Error(`SectionNotes schema mismatch after retry.\nRaw:\n${raw2}`);
    }
    return parsed2.data;
  }
}

/** ===================== Main Pipeline ===================== */
export async function runAiNotePipeline(rawText: string): Promise<string> {
  const text = normalizeInput(rawText);
  if (text.length < 20) throw new Error("Text too short");

  const groqKey = mustEnv("GROQ_API_KEY");
  const hfToken = mustEnv("HF_TOKEN");

  // ---------------- Step 1: Outline (Groq) ----------------
  const outlineRawText = await callGroqChat(
    groqKey,
    FAST_MODEL,
    outlinePrompt(text),
    { temperature: 0 }
  );

  const outlineObj = parseJsonFromModel<OutlineResult>(outlineRawText);
  const outlineParsed = OutlineSchema.safeParse(outlineObj);
  if (!outlineParsed.success) {
    throw new Error(`Outline JSON schema mismatch.\nRaw:\n${outlineRawText}`);
  }
  const outline = outlineParsed.data;

  // ---------------- Step 2: Section Notes (HF DeepSeek) ----------------
  const sectionNotes: SectionNotes[] = [];
  for (const s of outline.sections) {
    const notes = await callSectionNotesRobust({
      hfToken,
      id: s.id,
      heading: s.heading,
      sourceText: s.sourceText,
    });
    sectionNotes.push(notes);
  }

  // ---------------- Step 3: Final Merge (HF Kimi) ----------------
  const mergedInput = {
    title: outline.title,
    sections: outline.sections.map((s) => ({
      heading: s.heading,
      summary: s.summary,
      keyPoints: s.keyPoints,
      notes: sectionNotes.find((n) => n.id === s.id)!,
    })),
  };

  const finalRawText = await callHfRouterChat(
    hfToken,
    HF_KIMI_MODEL,
    finalMergePrompt(mergedInput),
    { temperature: 0 }
  );

  const finalObj = parseJsonFromModel<FinalNote>(finalRawText);
  const finalParsed = FinalNoteSchema.safeParse(finalObj);
  if (!finalParsed.success) {
    throw new Error(`FinalNote schema mismatch.\nRaw:\n${finalRawText}`);
  }

  return finalParsed.data.markdown;
}
