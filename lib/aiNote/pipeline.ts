import { z } from "zod";
import { outlinePrompt, sectionNotesPrompt, finalMergePrompt } from "./prompts";

import { callGroqChat } from "@/lib/ai/providers/groq";
import { callHfRouterChat } from "@/lib/ai/providers/hfRouter";
import { normalizeAiText } from "@/lib/ui/aiTextFormat";

const FAST_MODEL = "llama-3.1-8b-instant";

// HF Router models
const HF_DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B";
const HF_KIMI_MODEL = "moonshotai/Kimi-K2-Instruct-0905";

/** ===================== JSON Schemas ===================== */
const OutlineSchema = z.object({
  title: z.string().min(1),
  language: z.enum(["en", "zh", "auto"]).default("auto"),
  sourceType: z.enum(["lecture", "meeting", "quiz_review", "study_material", "general"]).default("general"),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        heading: z.string().min(1),
        summary: z.string().min(1),

        // ✅ 放宽：允许 0 个（模型有时会给空）
        keyPoints: z.array(z.string().min(1)).default([]),

        // ✅ 放宽：允许短句
        sourceText: z.string().min(1),
      })
    )
    .min(1),
});

const SectionNotesSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),

  bullets: z.array(z.string().min(1)).min(2).max(8),

  keyTerms: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .min(0)
    .max(5)
    .default([]),

  examples: z.array(z.string().min(1)).max(3).default([]),
  actionItems: z.array(z.string().min(1)).max(3).default([]),
});

const FinalNoteSchema = z.object({
  title: z.string().min(1).default("Notes"),

  executiveSummary: z.array(z.string().min(1)).min(0).max(6).default([]),

  sections: z
    .array(
      z.object({
            heading: z.string().min(1),
            bullets: z.array(z.string().min(1)).min(0).max(10).default([]),
          })
    )
    .min(0)
    .default([]),

  keyTerms: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .min(0)
    .max(10)
    .default([]),

  takeaways: z.array(z.string().min(1)).min(0).max(8).default([]),
  studyAids: z
    .array(
      z.object({
        label: z.string().min(1),
        items: z.array(z.string().min(1)).min(1).max(6),
      })
    )
    .max(4)
    .default([]),
  answerKey: z.array(z.string().min(1)).min(0).max(8).default([]),

  markdown: z.string().min(0).default(""),
});

type OutlineResult = z.infer<typeof OutlineSchema>;
type SectionNotes = z.infer<typeof SectionNotesSchema>;
type FinalNote = z.infer<typeof FinalNoteSchema>;

/** ===================== Helpers ===================== */
function normalizeInput(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * ✅ 更稳：移除 ```json ... ``` / ``` ... ```，保留内部内容
 */
function stripCodeFences(s: string) {
  let t = String(s || "").trim();

  // 如果整段被 ```...``` 包起来：取内部
  // 支持 ```json\n...\n```、```JSON ...```、``` \n ... \n ```
  const m = t.match(/^```(?:json|JSON|js|javascript|ts|typescript)?\s*\n?([\s\S]*?)\n?```$/);
  if (m) return (m[1] || "").trim();

  // 不是整段包裹：也做一次全局替换（有些模型会多段 fence）
  t = t.replace(/```(?:json|JSON|js|javascript|ts|typescript)?\s*\n?/g, "");
  t = t.replace(/```/g, "");
  return t.trim();
}

function stripThinkBlocks(s: string) {
  return String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function looksLikeHtml(s: string) {
  const t = String(s || "").trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head>") || t.includes("<body>");
}

/**
 * ✅ 抓第一个 JSON object：{ ... }
 */
function extractFirstJsonObject(s: string) {
  const text = String(s || "").trim();
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

/**
 * ✅ 抓第一个 JSON array：[ ... ]
 */
function extractFirstJsonArray(s: string) {
  const text = String(s || "").trim();
  const first = text.indexOf("[");
  if (first === -1) return null;

  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = first; i < text.length; i++) {
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
      if (ch === "[") depth++;
      if (ch === "]") depth--;

      if (depth === 0) return text.slice(first, i + 1);
    }
  }
  return null;
}

/**
 * ✅ 超稳 JSON 解析：fence/think 清理 + object/array 抽取
 */
function parseJsonFromModel<T>(raw: string): T {
  let t = String(raw || "").trim();
  t = stripThinkBlocks(t);
  t = stripCodeFences(t);

  // 有些模型会在 JSON 前后加“Here is the JSON:”
  // 尝试直接 parse
  try {
    return JSON.parse(t) as T;
  } catch {}

  // 抓对象
  const obj = extractFirstJsonObject(t);
  if (obj) {
    try {
      return JSON.parse(obj) as T;
    } catch {}
  }

  // 抓数组
  const arr = extractFirstJsonArray(t);
  if (arr) {
    try {
      return JSON.parse(arr) as T;
    } catch {}
  }

  // 只截取一部分，避免日志爆
  const head = String(raw || "").slice(0, 1200);
  throw new Error(`Failed to parse JSON from model (preview):\n${head}${String(raw || "").length > 1200 ? "\n...(truncated)" : ""}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureMinKeyPoints(section: { summary: string; sourceText: string; keyPoints?: string[] }, min = 2) {
  const kp = Array.isArray(section.keyPoints) ? section.keyPoints.filter(Boolean) : [];
  if (kp.length >= min) return kp.slice(0, 12);

  const base = `${section.summary}\n${section.sourceText}`.trim();
  const candidates = base
    .split(/[\n\.!\?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [...kp];
  for (const c of candidates) {
    if (out.length >= min) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, 12);
}

function ensureMinKeyTerms(
  obj: { heading: string; bullets: string[]; keyTerms?: { term: string; definition: string }[] },
  min = 1
) {
  const out = Array.isArray(obj.keyTerms) ? obj.keyTerms.filter((x) => x?.term && x?.definition) : [];
  return out.slice(0, 10);
}

function ensureSectionNotes(note: any): SectionNotes {
  const id = String(note?.id || "section-1");
  const heading = String(note?.heading || "Section");

  const bullets = Array.isArray(note?.bullets) ? note.bullets.filter(Boolean) : [];
  const safeBullets = bullets.length > 0 ? bullets.slice(0, 8) : [heading];

  const keyTermsRaw = Array.isArray(note?.keyTerms) ? note.keyTerms : [];
  const fixedKeyTerms = ensureMinKeyTerms({ heading, bullets: safeBullets, keyTerms: keyTermsRaw }, 1);

  const examples = Array.isArray(note?.examples) ? note.examples.filter(Boolean).slice(0, 3) : [];
  const actionItems = Array.isArray(note?.actionItems) ? note.actionItems.filter(Boolean).slice(0, 3) : [];

  const obj: SectionNotes = {
    id,
    heading,
    bullets: safeBullets,
    keyTerms: fixedKeyTerms,
    examples,
    actionItems,
  };

  const parsed = SectionNotesSchema.safeParse(obj);
  if (!parsed.success) {
    return {
      id,
      heading,
      bullets: [heading],
      keyTerms: fixedKeyTerms,
      examples: [],
      actionItems: [],
    };
  }
  return parsed.data;
}

function ensureFinalNote(note: any): FinalNote {
  const title = String(note?.title || "Notes").trim() || "Notes";

  const executiveSummary = Array.isArray(note?.executiveSummary) ? note.executiveSummary.filter(Boolean).slice(0, 6) : [];
  const sectionsRaw = Array.isArray(note?.sections) ? note.sections : [];

  const safeSections =
    sectionsRaw.length > 0
      ? sectionsRaw
          .map((x: any) => ({
            heading: String(x?.heading || "Section").trim() || "Section",
            bullets: Array.isArray(x?.bullets) ? x.bullets.filter(Boolean).slice(0, 10) : [],
          }))
          .filter((x: any) => x.bullets.length > 0)
      : [
          {
            heading: "Main Notes",
            bullets: executiveSummary.length ? executiveSummary : ["(No content)"],
          },
        ];

  const keyTerms = Array.isArray(note?.keyTerms) ? note.keyTerms : [];
  const takeaways = Array.isArray(note?.takeaways) ? note.takeaways.filter(Boolean).slice(0, 8) : [];
  const studyAids = Array.isArray(note?.studyAids)
    ? note.studyAids
        .map((x: any) => ({
          label: String(x?.label || "Study Aid").trim() || "Study Aid",
          items: Array.isArray(x?.items) ? x.items.filter(Boolean).slice(0, 6) : [],
        }))
        .filter((x: any) => x.items.length > 0)
        .slice(0, 4)
    : [];
  const answerKey = Array.isArray(note?.answerKey) ? note.answerKey.filter(Boolean).slice(0, 8) : [];

  let markdown = String(note?.markdown || "").trim();

  if (!markdown) {
    markdown = [
      `# ${title}`,
      ``,
      `## Executive Summary`,
      ...(executiveSummary.length ? executiveSummary.map((x: string) => `- ${x}`) : ["- (empty)"]),
      ``,
      `## Main Notes`,
      ...safeSections.flatMap((sec: any) => [`### ${sec.heading}`, ...sec.bullets.map((b: string) => `- ${b}`), ``]),
      keyTerms.length
        ? [`## Important Terms`, ...keyTerms.slice(0, 10).map((k: any) => `- **${k.term}**: ${k.definition}`), ``].join("\n")
        : ``,
      takeaways.length
        ? [`## Takeaways`, ...takeaways.map((x: string) => `- ${x}`), ``].join("\n")
        : ``,
      studyAids.length
        ? [
            `## Study Aids`,
            ...studyAids.flatMap((aid: any) => [`### ${aid.label}`, ...aid.items.map((item: string) => `- ${item}`), ``]),
          ].join("\n")
        : ``,
      answerKey.length
        ? [`## Answer Key / Extracted Answers`, ...answerKey.map((x: string) => `- ${x}`), ``].join("\n")
        : ``,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const obj: FinalNote = {
    title,
    executiveSummary: executiveSummary.length ? executiveSummary : ["(empty)"],
    sections: safeSections,
    keyTerms,
    takeaways,
    studyAids,
    answerKey,
    markdown,
  };

  const parsed = FinalNoteSchema.safeParse(obj);
  if (!parsed.success) return { ...obj, markdown };
  return parsed.data;
}

/**
 * ✅ HF Router 调用包装：处理 503/HTML/网络抖动，指数退避重试
 */
async function callHfRouterChatRobust(hfToken: string, model: string, messages: any, opts: any, label: string) {
  const maxTry = Number.parseInt(process.env.AI_NOTE_HF_RETRIES || "4", 10) || 4;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxTry; attempt++) {
    try {
      const raw = await callHfRouterChat(hfToken, model, messages, opts);

      if (!raw || (typeof raw === "string" && raw.trim().length === 0)) {
        throw new Error(`HF Router returned empty. label=${label}`);
      }
      if (typeof raw === "string" && looksLikeHtml(raw)) {
        throw new Error(`HF Router returned HTML (likely 503). label=${label}`);
      }

      return raw;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);

      const retryable =
        msg.includes("503") ||
        msg.toLowerCase().includes("service unavailable") ||
        msg.toLowerCase().includes("hf router") ||
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("timeout") ||
        msg.includes("returned HTML") ||
        msg.includes("returned empty");

      if (!retryable || attempt === maxTry) break;

      const backoff = Math.min(8000, 500 * Math.pow(2, attempt - 1));
      console.warn(
        `[aiNote/pipeline] HF retry ${attempt}/${maxTry} label=${label} backoff=${backoff}ms msg=${msg.slice(0, 160)}`
      );
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

    return ensureSectionNotes(parsed1.data);
  } catch {
    // 2) HF hard retry (force JSON)
    try {
      const hardMessages = [
        {
          role: "system" as const,
          content: [
            "Return ONLY valid JSON.",
            "Do NOT output <think> tags, reasoning, markdown, or any extra text.",
            "Do NOT wrap in ``` fences.",
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
            `- bullets: 3-8, each should explain a knowledge point`,
            `- keyTerms: 0-5, only if truly supported`,
            `- examples: 0-3`,
            `- actionItems: 0-4, use as study aids or review prompts`,
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

      return ensureSectionNotes(parsed2.data);
    } catch {
      // 3) fallback: Groq
      const fallbackRaw = await callGroqChat(
        groqKey,
        FAST_MODEL,
        sectionNotesPrompt({ id, heading, sourceText }),
        { temperature: 0 }
      );

      const obj3 = parseJsonFromModel<SectionNotes>(fallbackRaw);
      return ensureSectionNotes(obj3);
    }
  }
}

/** ===================== Final Merge robust (HF retry + fallback Groq) ===================== */
async function callFinalMergeRobust(args: { hfToken: string; groqKey: string; mergedInput: any }): Promise<FinalNote> {
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
    return ensureFinalNote(obj);
  } catch {
    // fallback Groq
    const raw2 = await callGroqChat(groqKey, FAST_MODEL, finalMergePrompt(mergedInput), { temperature: 0 });
    const obj2 = parseJsonFromModel<FinalNote>(raw2);
    return ensureFinalNote(obj2);
  }
}

/** ===================== Main Pipeline ===================== */
export async function runAiNotePipeline(rawText: string): Promise<string> {
  const text = normalizeInput(rawText);
  if (text.length < 20) throw new Error("Text too short");

  const groqKey = mustEnv("GROQ_API_KEY");
  const hfToken = mustEnv("HF_TOKEN");

  // ✅ 超短文本：不走复杂 pipeline，直接 markdown（更稳）
  if (text.length < 200) {
    const raw = await callGroqChat(
      groqKey,
      FAST_MODEL,
      [
        {
          role: "system",
          content:
            "You write compact but high-value study notes in markdown-style text. Use clear sections, short subpoints, and separated knowledge points. Avoid one giant wall of text and avoid shallow extraction dumps. You may use labels like ⭐ Important, 📘 Concept, ⚡ Tip, 🧪 Example, and ⚠️ Warning naturally inside sections.",
        },
        { role: "user", content: `Make a short but genuinely useful note from the text below.\nUse: Title, Executive Summary, Main Notes, and Takeaways.\nKeep each knowledge point distinct.\n\nText:\n${text}` },
      ],
      { temperature: 0 }
    );
    return normalizeAiText(String(raw || "").trim());
  }

  // ---------------- Step 1: Outline (Groq) ----------------
  const outlineRawText = await callGroqChat(groqKey, FAST_MODEL, outlinePrompt(text), { temperature: 0 });

  if (!outlineRawText || (typeof outlineRawText === "string" && looksLikeHtml(outlineRawText))) {
    throw new Error(`Outline model returned bad response (empty/html).`);
  }

  const outlineObj = parseJsonFromModel<OutlineResult>(outlineRawText);
  const outlineParsed = OutlineSchema.safeParse(outlineObj);
  if (!outlineParsed.success) {
    throw new Error(`Outline JSON schema mismatch.\nRaw:\n${String(outlineRawText).slice(0, 1200)}${String(outlineRawText).length > 1200 ? "\n...(truncated)" : ""}`);
  }

  const outline = outlineParsed.data;

  // ✅ normalize sections：补 keyPoints/sourceText
  outline.sections = outline.sections.map((s) => ({
    ...s,
    keyPoints: ensureMinKeyPoints(s, 2),
    sourceText: (s.sourceText || s.summary || " ").trim() || " ",
  }));

  // ---------------- Step 2: Section Notes ----------------
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

  // ---------------- Step 3: Final Merge ----------------
  const mergedInput = {
    title: outline.title,
    sourceType: outline.sourceType,
    sections: outline.sections.map((s) => ({
      heading: s.heading,
      summary: s.summary,
      keyPoints: s.keyPoints,
      notes: sectionNotes.find((n) => n.id === s.id) || null,
    })),
  };

  const finalNote = await callFinalMergeRobust({ hfToken, groqKey, mergedInput });
  return normalizeAiText(finalNote.markdown);
}
