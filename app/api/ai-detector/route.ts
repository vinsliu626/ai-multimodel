// app/api/ai-detector/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// 只要出现中日韩等字符就判定非英文（与你前端一致）
function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function mean(arr: number[]) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","while","of","to","in","on","for","with","as","by","from","at",
  "is","are","was","were","be","been","being","it","this","that","these","those","i","you","he","she","they","we",
  "my","your","his","her","their","our","me","him","them","us",
  "do","does","did","doing","have","has","had",
  "can","could","may","might","will","would","shall","should","must",
  "not","no","nor","so","than","too","very",
  "there","here","into","over","under","about","between","among","through","during","before","after","above","below",
]);

// 更“AI味”的短语库（扩大命中面：说明文 + 议论文 + narrative）
const AI_PHRASES = [
  // 说明文/议论文常见
  "in conclusion",
  "overall",
  "moreover",
  "furthermore",
  "additionally",
  "it is important to note",
  "this essay will",
  "this paper will",
  "this article will",
  "as a result",
  "in summary",
  "on the other hand",
  "in terms of",
  "a key factor",
  "plays a crucial role",
  "it can be argued",
  "this suggests that",
  "from this perspective",
  "it is evident that",

  // AI 常见“免责声明/万能句”
  "as an ai",
  "as a language model",
  "i don't have personal",
  "i cannot",
  "i can't",
  "i do not have access",
  "it's worth noting",
  "it is worth noting",
  "this highlights",
  "this underscores",

  // narrative 里常见模板句
  "from a young age",
  "growing up",
  "in my experience",
  "throughout my life",
  "this experience taught me",
  "i learned that",
  "it made me realize",
];

function tokenizeWords(text: string) {
  const m = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
  return m ?? [];
}

function splitSentences(text: string) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string) {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function distinctN(words: string[], n: number) {
  if (words.length < n) return 0;
  const total = words.length - n + 1;
  const set = new Set<string>();
  for (let i = 0; i < total; i++) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set.size / total; // 越低越重复
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
  for (const [, c] of freq) {
    if (c >= 2) repeated += c;
  }
  return repeated / total;
}

function typeTokenRatio(words: string[]) {
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

function stopwordRatio(words: string[]) {
  if (words.length === 0) return 0;
  let sw = 0;
  for (const w of words) if (STOPWORDS.has(w)) sw++;
  return sw / words.length;
}

function punctuationDensity(text: string) {
  const punct = (text.match(/[,:;()\-—]/g) ?? []).length;
  return punct / Math.max(1, text.length);
}

function phraseHitRate(textLower: string) {
  let hits = 0;
  for (const p of AI_PHRASES) {
    if (textLower.includes(p)) hits++;
  }
  // 3+ 命中就算很“模板化”
  return clamp(hits / 3, 0, 1);
}

function sentenceStartDiversity(sentences: string[]) {
  const starts: string[] = [];
  for (const s of sentences) {
    const w = tokenizeWords(s);
    if (w.length >= 2) starts.push(w[0] + " " + w[1]);
    else if (w.length === 1) starts.push(w[0]);
  }
  if (starts.length === 0) return 0;
  return new Set(starts).size / starts.length; // 越低越像模板
}

// 句长“过于均匀”也是一个信号
function sentenceLengthUniformity(sentLens: number[]) {
  if (sentLens.length < 6) return 0;
  const m = mean(sentLens);
  const sd = std(sentLens);
  if (m <= 0) return 0;
  const cv = sd / m; // 越小越均匀
  return clamp((0.35 - cv) / 0.25, 0, 1);
}

// 段落结构过于规整 → 弱信号
function paragraphUniformity(text: string) {
  const ps = splitParagraphs(text);
  if (ps.length < 3) return 0;
  const lens = ps.map((p) => tokenizeWords(p).length).filter((n) => n > 0);
  if (lens.length < 3) return 0;
  const m = mean(lens);
  const sd = std(lens);
  if (m <= 0) return 0;
  const cv = sd / m;
  return clamp((0.45 - cv) / 0.30, 0, 1);
}

/** ===== 句子级解释（用于展示哪些句子更像 AI）===== */
function scoreSentenceLite(sentence: string) {
  const lower = sentence.toLowerCase();
  const w = tokenizeWords(sentence);

  const phr = phraseHitRate(lower); // 0..1
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

/** ===== 高亮：标出命中的 AI_PHRASES（像 Scribbr 的“可疑短语”）===== */
type Highlight = {
  start: number;
  end: number;
  type: "phrase";
  label: string;
  severity: number; // 0..1
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

  // 合并重叠（避免一堆高亮叠一起）
  out.sort((a, b) => a.start - b.start);
  const merged: Highlight[] = [];
  for (const h of out) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      last.severity = Math.max(last.severity, h.severity);
      last.phrase = last.phrase; // 保留第一个
    } else {
      merged.push({ ...h });
    }
  }
  return merged;
}

/** ===== 总分（你这版 aggressive）===== */
function scoreAiLikelihoodAggressive(text: string) {
  const textLower = text.toLowerCase();
  const words = tokenizeWords(text);
  const sents = splitSentences(text);

  const sentLens = sents.map((s) => tokenizeWords(s).length).filter((n) => n > 0);
  const mLen = mean(sentLens);
  const sdLen = std(sentLens);
  const burstiness = mLen > 0 ? sdLen / mLen : 0;

  const ttr = typeTokenRatio(words);
  const swr = stopwordRatio(words);
  const pden = punctuationDensity(text);

  const rep2 = ngramRepeatRate(words, 2);
  const rep3 = ngramRepeatRate(words, 3);
  const rep4 = ngramRepeatRate(words, 4);
  const d4 = distinctN(words, 4);

  const startDiv = sentenceStartDiversity(sents);
  const phr = phraseHitRate(textLower);

  const uniSent = sentenceLengthUniformity(sentLens);
  const uniPara = paragraphUniformity(text);

  // 归一化
  const nBurst = clamp(1 - burstiness / 0.90, 0, 1);
  const nTtr   = clamp((0.62 - ttr) / 0.26, 0, 1);
  const nSwr   = clamp((swr - 0.34) / 0.26, 0, 1);
  const nPden  = clamp((pden - 0.010) / 0.020, 0, 1);

  const nRep2  = clamp((rep2 - 0.03) / 0.12, 0, 1);
  const nRep3  = clamp((rep3 - 0.015) / 0.08, 0, 1);
  const nRep4  = clamp((rep4 - 0.008) / 0.05, 0, 1);
  const nD4    = clamp((0.78 - d4) / 0.30, 0, 1);

  const nStart = clamp((0.78 - startDiv) / 0.40, 0, 1);

  const raw =
    0.14 * nBurst +
    0.08 * nTtr +
    0.08 * nSwr +
    0.03 * nPden +
    0.14 * nRep2 +
    0.12 * nRep3 +
    0.07 * nRep4 +
    0.06 * nD4 +
    0.08 * nStart +
    0.18 * phr +
    0.06 * uniSent +
    0.04 * uniPara;

  // Aggressive mapping
  let ai01 = sigmoid(12 * (raw - 0.28));
  ai01 = clamp(ai01 + 0.18, 0, 1); // 抬高底座（宁可误伤）

  const strongSignals = [
    phr > 0.34,
    nStart > 0.55,
    uniSent > 0.60,
    (nRep3 > 0.45 && nRep2 > 0.40),
    (nD4 > 0.55 && nRep2 > 0.35),
  ].filter(Boolean).length;

  if (strongSignals >= 2) ai01 = Math.max(ai01, 0.97);
  else if (strongSignals === 1) ai01 = Math.max(ai01, 0.90);

  // 长度置信度
  const wCount = words.length;
  const conf = clamp((wCount - 60) / 380, 0, 1);
  ai01 = clamp(ai01 * (0.90 + 0.10 * conf), 0, 1);

  const ai = Math.round(ai01 * 100);

  // Mixed：AI 高就让 mixed 更低
  const mixed01 = clamp(0.20 * (1 - Math.abs(ai01 - 0.65) / 0.65), 0, 0.25);
  let mixed = Math.round(mixed01 * 100);
  let human = 100 - ai - mixed;

  if (human < 0) {
    const need = -human;
    mixed = clamp(mixed - need, 0, 100);
    human = 100 - ai - mixed;
  }

  return {
    ai,
    mixed,
    human,
    debug: {
      raw,
      burstiness,
      ttr,
      swr,
      rep2,
      rep3,
      rep4,
      d4,
      startDiv,
      phraseHitsApprox: Math.round(phr * 3),
      uniSent,
      uniPara,
      strongSignals,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; lang?: string };
    const text = (body?.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing text." }, { status: 400 });
    }
    if (hasNonEnglish(text)) {
      return NextResponse.json({ ok: false, error: "Only English text is supported." }, { status: 400 });
    }

    const words = countWords(text);
    if (words < 40) {
      return NextResponse.json({ ok: false, error: "To analyze text, add at least 40 words." }, { status: 400 });
    }

    const { ai, mixed, human, debug } = scoreAiLikelihoodAggressive(text);

    // ✅ 句子级
    const sents = splitSentences(text);
    const sentenceResults = sents.map((s) => ({
      text: s,
      ...scoreSentenceLite(s),
    }));

    // ✅ 高亮（短语命中）
    const highlights = findPhraseHighlights(text);

    return NextResponse.json({
      ok: true,
      aiGenerated: ai,
      humanAiRefined: mixed,
      humanWritten: human,

      // 🔥 新增：前端可以像 Scribbr 一样展示
      sentences: sentenceResults,
      highlights,

      meta: {
        words,
        provider: "heuristic-v2-aggressive",
        // 线上不想暴露就删掉 debug
        debug,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error." }, { status: 500 });
  }
}
