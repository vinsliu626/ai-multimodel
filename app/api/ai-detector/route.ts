// app/api/ai-detector/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // 路径按你项目改

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Python detector endpoint
 * - local dev: http://127.0.0.1:8000/detect
 * - production: set env PY_DETECTOR_URL=https://your-domain/detect
 */
const PY_DETECTOR_URL =
  process.env.PY_DETECTOR_URL?.trim() || "http://127.0.0.1:8000/detect";

// ---------- utils ----------
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// 只要出现中日韩等字符就判定非英文
function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

// ✅ 动态超时：文本越长，给 python 越久
function pythonTimeoutMs(text: string) {
  const w = countWords(text);
  if (w <= 300) return 15_000;
  if (w <= 800) return 35_000;
  if (w <= 1500) return 60_000;
  if (w <= 3000) return 90_000;
  return 120_000;
}

// ✅ fetch + timeout（AbortController）
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- heuristic pieces ----------
const AI_PHRASES = [
  "in conclusion","overall","moreover","furthermore","additionally",
  "it is important to note","this essay will","this paper will","this article will",
  "as a result","in summary","on the other hand","in terms of",
  "a key factor","plays a crucial role","it can be argued","this suggests that",
  "from this perspective","it is evident that",
  "as an ai","as a language model","i don't have personal","i cannot","i can't","i do not have access",
  "it's worth noting","it is worth noting","this highlights","this underscores",
  "from a young age","growing up","in my experience","throughout my life",
  "this experience taught me","i learned that","it made me realize",
];

function tokenizeWords(text: string) {
  const m = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
  return m ?? [];
}

function splitSentencesWithOffsets(text: string) {
  const out: { text: string; start: number; end: number }[] = [];
  const s = text.replace(/\r/g, "");
  let start = 0;

  const pushTrimmed = (rawStart: number, rawEnd: number) => {
    if (rawEnd <= rawStart) return;
    const rawSlice = s.slice(rawStart, rawEnd);
    const slice = rawSlice.trim();
    if (!slice) return;

    const leftTrim = rawSlice.match(/^\s*/)?.[0]?.length ?? 0;
    const rightTrim = rawSlice.match(/\s*$/)?.[0]?.length ?? 0;

    const realStart = rawStart + leftTrim;
    const realEnd = rawEnd - rightTrim;

    if (realEnd > realStart) {
      out.push({ text: s.slice(realStart, realEnd), start: realStart, end: realEnd });
    }
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isEndPunc = ch === "." || ch === "!" || ch === "?";
    const isNewline = ch === "\n";

    if (isEndPunc) {
      pushTrimmed(start, i + 1);
      start = i + 1;
      continue;
    }

    if (isNewline) {
      pushTrimmed(start, i);
      let j = i;
      while (j < s.length && s[j] === "\n") j++;
      start = j;
      i = j - 1;
      continue;
    }
  }

  if (start < s.length) pushTrimmed(start, s.length);
  return out;
}

function phraseHitRate(textLower: string) {
  let hits = 0;
  for (const p of AI_PHRASES) if (textLower.includes(p)) hits++;
  return clamp(hits / 3, 0, 1);
}

function ngramRepeatRate(words: string[], n: number) {
  if (words.length < n + 2) return 0;
  const total = words.length - n + 1;
  const freq = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const g = words.slice(i, i + n).join(" ");
    freq.set(g, (freq.get(g) ?? 0) + 1);
  }
  let repeated = 0;
  for (const [, c] of freq) if (c >= 2) repeated += c;
  return repeated / total;
}

function typeTokenRatio(words: string[]) {
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

function scoreSentenceLite(sentence: string) {
  const lower = sentence.toLowerCase();
  const w = tokenizeWords(sentence);

  const phr = phraseHitRate(lower);
  const rep2 = ngramRepeatRate(w, 2);
  const rep3 = ngramRepeatRate(w, 3);
  const ttr = typeTokenRatio(w);

  const sRaw =
    0.45 * phr +
    0.25 * clamp((rep2 - 0.03) / 0.12, 0, 1) +
    0.20 * clamp((rep3 - 0.015) / 0.08, 0, 1) +
    0.10 * clamp((0.62 - ttr) / 0.26, 0, 1);

  const aiScore = Math.round(clamp(sigmoid(10 * (sRaw - 0.25)) + 0.10, 0, 1) * 100);

  const reasons: string[] = [];
  if (phr > 0.2) reasons.push("Template phrases / transitions");
  if (rep3 > 0.05 || rep2 > 0.10) reasons.push("Repeated phrasing");
  if (ttr < 0.42) reasons.push("Low lexical variety");

  return { aiScore, reasons };
}

type Highlight = {
  start: number;
  end: number;
  type: "phrase";
  label: string;
  severity: number;
  phrase: string;
};

function findPhraseHighlights(text: string): Highlight[] {
  const lower = text.toLowerCase();
  const out: Highlight[] = [];

  for (const p of AI_PHRASES) {
    let idx = 0;
    while (true) {
      const hit = lower.indexOf(p, idx);
      if (hit === -1) break;
      out.push({
        start: hit,
        end: hit + p.length,
        type: "phrase",
        label: "Template phrase",
        severity: 0.85,
        phrase: p,
      });
      idx = hit + p.length;
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---------- Python client ----------
type PyDetectResponse = {
  ok: boolean;
  result: [
    {
      "AI overall"?: number;
      [k: string]: any;
    },
    string
  ];
};

async function callPythonDetector(text: string) {
  const timeoutMs = pythonTimeoutMs(text);

  const res = await fetchWithTimeout(
    PY_DETECTOR_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    },
    timeoutMs
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Python detector HTTP ${res.status}: ${body.slice(0, 250)}`);
  }

  const data = (await res.json()) as PyDetectResponse;
  if (!data?.ok || !data?.result?.[0]) {
    const maybeErr = (data as any)?.error;
    throw new Error(maybeErr ? String(maybeErr) : "Python detector invalid response.");
  }
  return data;
}

// ---------- route ----------
export async function POST(req: Request) {
  try {
    // ✅ 必须登录（你要求：不登录不能用除聊天外的功能）
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const body = (await req.json()) as { text?: string; lang?: string };
    const text = (body?.text ?? "").trim();

    if (!text) return NextResponse.json({ ok: false, error: "Missing text." }, { status: 400 });
    if (hasNonEnglish(text)) {
      return NextResponse.json({ ok: false, error: "Only English text is supported." }, { status: 400 });
    }

    const words = countWords(text);
    if (words < 40) {
      return NextResponse.json({ ok: false, error: "To analyze text, add at least 40 words." }, { status: 400 });
    }

    // ✅ 配额检查：detector_words（按 words 计）
    try {
      await assertQuotaOrThrow({ userId, action: "detector", amount: words });
    } catch (e) {
      if (e instanceof QuotaError) {
        return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: 429 });
      }
      throw e;
    }

    // 1) sentence results with offsets
    const sents = splitSentencesWithOffsets(text);
    const sentenceResults = sents.map((seg) => ({
      text: seg.text,
      start: seg.start,
      end: seg.end,
      ...scoreSentenceLite(seg.text),
    }));

    // 2) highlights (phrase only)
    const highlights = findPhraseHighlights(text);

    // 3) python detector
    const py = await callPythonDetector(text);
    const metrics = py.result[0];
    const aiOverallRaw = Number(metrics?.["AI overall"]);

    if (!Number.isFinite(aiOverallRaw)) {
      return NextResponse.json(
        { ok: false, error: "Python detector did not return AI overall." },
        { status: 502 }
      );
    }

    const aiGenerated = clamp(Math.round(aiOverallRaw), 0, 100);
    const humanAiRefined = 0;
    const humanWritten = clamp(100 - aiGenerated, 0, 100);

    // ✅ 记用量（成功才写）
    await addUsageEvent(userId, "detector_words", words).catch((err) =>
      console.error("[detector] usageEvent write failed:", err)
    );

    return NextResponse.json({
      ok: true,
      aiGenerated,
      humanAiRefined,
      humanWritten,
      sentences: sentenceResults,
      highlights,
      python: {
        url: PY_DETECTOR_URL,
        message: py.result[1],
        metrics,
      },
      meta: {
        words,
        timeoutMs: pythonTimeoutMs(text),
        provider: "python-gpt2ppl-ai-overall + local-heuristic-explanations",
      },
    });
  } catch (e: any) {
    const msg =
      e?.name === "AbortError"
        ? "Python detector request timed out."
        : e?.message ?? "Unknown error.";

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
