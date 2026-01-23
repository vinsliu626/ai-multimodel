import { z } from "zod";
import { outlinePrompt, sectionNotesPrompt, finalMergePrompt } from "./prompts";

import type { OutlineSection as OutlineResult, SectionNotes, FinalNote } from "./types";

import { callGroqChat } from "@/lib/ai/providers/groq";
import { callHfRouterChat } from "@/lib/ai/providers/hfRouter";

const FAST_MODEL = "llama-3.1-8b-instant";

// HF Router models
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
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function looksLikeHtml(s: string) {
  const t = s.trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head>") || t.includes("<body>");
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

      if (depth === 0) return text.slice(firstBrace, i + 1);
    }
  }
  return null;
}

function parseJsonFromModel<T>(raw: string): T {
  let t = raw.trim();
  t = stripCodeFences(t);
  t = stripThinkBlocks(t);

  try {
    return JSON.parse(t) as T;
  } catch {}

  const obj = extractFirstJsonObject(t);
  if (obj) {
    try {
      return JSON.parse(obj) as T;
    } catch {}
  }

  throw new Error(`Failed to parse JSON from model:\n${raw}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * ✅ HF Router 调用包装：处理 503/HTML/网络抖动，指数退避重试
 */
async function callHfRouterChatRobust(
  hfToken: string,
  model: string,
  messages: any,
  opts: any,
  label: string
) {
  const maxTry = Number.parseInt(process.env.AI_NOTE_HF_RETRIES || "4", 10) || 4;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxTry; attempt++) {
    try {
      const raw = await callHfRouterChat(hfToken, model, messages, opts);

      // 有时 provider 不 throw，但返回 HTML（你现在遇到的 503 页面）
      if (typeof raw === "string" && looksLikeHtml(raw)) {
        throw new Error(`HF Router returned HTML (likely 503). label=${label}`);
      }

      return raw;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);

      // 只对这些情况重试：503 / Service Unavailable / HTML / fetch失败
      const retryable =
        msg.includes("503") ||
        msg.toLowerCase().includes("service unavailable") ||
        msg.toLowerCase().includes("hf router") ||
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("timeout") ||
        msg.includes("returned HTML");

      if (!retryable || attempt === maxTry) break;

      const backoff = Math.min(8000, 500 * Math.pow(2, attempt - 1)); // 500,1000,2000,4000...
      console.warn(`[aiNote/pipeline] HF retry ${attempt}/${maxTry} label=${label} backoff=${backoff}ms msg=${msg.slice(0, 160)}`);
      await sleep(backoff);
    }
  }

  throw new Error(`HF Router failed after retries. label=${label}. last=${String(lastErr?.message || lastErr)}`);
}

/** ===================== Robust Section Notes (HF retry + fallback Groq) ===================== */
async function callSectionNotesRobust(args: {
  hfToken: string;
  groqKey: string;
  id: string;
  heading: string;
  sourceText: string;
}): Promise<SectionNotes> {
  const { hfToken, groqKey, id, heading, sourceText } = args;

  // 1) HF first
  try {
    const raw1 = await callHfRouterChatRobust(
      hfToken,
      HF_DEEPSEEK_MODEL,
      sectionNotesPrompt({ id, heading, sourceText }),
      { temperature: 0 },
      `section:${id}`
    );

    const obj1 = parseJsonFromModel<SectionNotes>(raw1);
    const parsed1 = SectionNotesSchema.safeParse(obj1);
    if (!parsed1.success) throw new Error("SectionNotes schema mismatch");
    return parsed1.data;
  } catch (e1) {
    // 2) HF hard retry (force JSON)
    try {
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

      const raw2 = await callHfRouterChatRobust(
        hfToken,
        HF_DEEPSEEK_MODEL,
        hardMessages,
        { temperature: 0 },
        `section-hard:${id}`
      );

      const obj2 = parseJsonFromModel<SectionNotes>(raw2);
      const parsed2 = SectionNotesSchema.safeParse(obj2);
      if (!parsed2.success) throw new Error("SectionNotes schema mismatch after hard retry");
      return parsed2.data;
    } catch (e2) {
      // 3) fallback: Groq
      const fallbackRaw = await callGroqChat(
        groqKey,
        FAST_MODEL,
        sectionNotesPrompt({ id, heading, sourceText }),
        { temperature: 0 }
      );

      const obj3 = parseJsonFromModel<SectionNotes>(fallbackRaw);
      const parsed3 = SectionNotesSchema.safeParse(obj3);
      if (!parsed3.success) {
        throw new Error(`SectionNotes fallback (Groq) schema mismatch.\nRaw:\n${fallbackRaw}`);
      }
      return parsed3.data;
    }
  }
}

/** ===================== Final Merge robust (HF retry + fallback Groq) ===================== */
async function callFinalMergeRobust(args: {
  hfToken: string;
  groqKey: string;
  mergedInput: any;
}): Promise<FinalNote> {
  const { hfToken, groqKey, mergedInput } = args;

  // HF first
  try {
    const raw = await callHfRouterChatRobust(
      hfToken,
      HF_KIMI_MODEL,
      finalMergePrompt(mergedInput),
      { temperature: 0 },
      "final-merge"
    );

    const obj = parseJsonFromModel<FinalNote>(raw);
    const parsed = FinalNoteSchema.safeParse(obj);
    if (!parsed.success) throw new Error("FinalNote schema mismatch");
    return parsed.data;
  } catch (e1) {
    // fallback Groq
    const raw2 = await callGroqChat(
      groqKey,
      FAST_MODEL,
      finalMergePrompt(mergedInput),
      { temperature: 0 }
    );

    const obj2 = parseJsonFromModel<FinalNote>(raw2);
    const parsed2 = FinalNoteSchema.safeParse(obj2);
    if (!parsed2.success) {
      throw new Error(`FinalNote fallback (Groq) schema mismatch.\nRaw:\n${raw2}`);
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
  const outlineRawText = await callGroqChat(groqKey, FAST_MODEL, outlinePrompt(text), { temperature: 0 });

  const outlineObj = parseJsonFromModel<OutlineResult>(outlineRawText);
  const outlineParsed = OutlineSchema.safeParse(outlineObj);
  if (!outlineParsed.success) {
    throw new Error(`Outline JSON schema mismatch.\nRaw:\n${outlineRawText}`);
  }
  const outline = outlineParsed.data;

  // ---------------- Step 2: Section Notes (HF with retry + fallback) ----------------
  const sectionNotes: SectionNotes[] = [];
  for (const s of outline.sections) {
    const notes = await callSectionNotesRobust({
      hfToken,
      groqKey,
      id: s.id,
      heading: s.heading,
      sourceText: s.sourceText,
    });
    sectionNotes.push(notes);
  }

  // ---------------- Step 3: Final Merge (HF with retry + fallback) ----------------
  const mergedInput = {
    title: outline.title,
    sections: outline.sections.map((s) => ({
      heading: s.heading,
      summary: s.summary,
      keyPoints: s.keyPoints,
      notes: sectionNotes.find((n) => n.id === s.id)!,
    })),
  };

  const finalNote = await callFinalMergeRobust({ hfToken, groqKey, mergedInput });

  return finalNote.markdown;
}
