// app/api/ai-detector/route.ts
import { NextResponse } from "next/server";

// ====== ✅ 可选：Transformers 模型（失败自动回退 heuristic）======
let _pipelinePromise: Promise<any> | null = null;

// ✅ 不要写成 null/undefined，写死一个已知可用的 ONNX 模型
const MODEL_ID = "onnx-community/roberta-base-openai-detector-ONNX";

// 懒加载，避免每次请求都加载
async function getTextClassifier() {
  if (_pipelinePromise) return _pipelinePromise;

  _pipelinePromise = (async () => {
    const t = await import("@huggingface/transformers");
    if (t.env) {
      t.env.allowRemoteModels = true;
      t.env.allowLocalModels = false;
    }
    return t.pipeline("text-classification", MODEL_ID);
  })();

  return _pipelinePromise;
}

// roberta-openai-detector 常见输出 label: "FAKE"/"REAL"
function toAiProbFromClassifier(out: any): { ai01: number; label: string; conf: number } {
  const arr = Array.isArray(out) ? out : [];
  const best = arr.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0];
  if (!best) return { ai01: 0.5, label: "UNKNOWN", conf: 0.5 };

  const label = String(best.label ?? "").toLowerCase();
  const score = clamp(Number(best.score ?? 0.5), 0, 1);

  let ai01 = 0.5;
  if (label.includes("fake") || label.includes("ai") || label.includes("generated")) ai01 = score;
  else if (label.includes("real") || label.includes("human")) ai01 = 1 - score;
  else ai01 = score;

  const conf = Math.max(score, 1 - score);
  return { ai01: clamp(ai01, 0, 1), label: String(best.label ?? "UNKNOWN"), conf };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
  for (let i = 0; i < total; i++) set.add(words.slice(i, i + n).join(" "));
  return set.size / total;
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
  for (const p of AI_PHRASES) if (textLower.includes(p)) hits++;
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
  return new Set(starts).size / starts.length;
}

function sentenceLengthUniformity(sentLens: number[]) {
  if (sentLens.length < 6) return 0;
  const m = mean(sentLens);
  const sd = std(sentLens);
  if (m <= 0) return 0;
  const cv = sd / m;
  return clamp((0.35 - cv) / 0.25, 0, 1);
}

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

/** 句子级解释 */
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
  const merged: Highlight[] = [];
  for (const h of out) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      last.severity = Math.max(last.severity, h.severity);
    } else merged.push({ ...h });
  }
  return merged;
}

/** ✅ 总分（从 aggressive 调整为 “不误伤学术”） */
function scoreAiLikelihoodTamed(text: string, detectorAi01: number | null) {
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

  const nBurst = clamp(1 - burstiness / 0.90, 0, 1);
  const nTtr   = clamp((0.62 - ttr) / 0.26, 0, 1);
  const nSwr   = clamp((swr - 0.34) / 0.26, 0, 1);
  const nPden  = clamp((pden - 0.010) / 0.020, 0, 1);

  const nRep2  = clamp((rep2 - 0.03) / 0.12, 0, 1);
  const nRep3  = clamp((rep3 - 0.015) / 0.08, 0, 1);
  const nRep4  = clamp((rep4 - 0.008) / 0.05, 0, 1);
  const nD4    = clamp((0.78 - d4) / 0.30, 0, 1);

  const nStart = clamp((0.78 - startDiv) / 0.40, 0, 1);

  // ✅ 关键：把 “短语命中”权重降下来（学术写作太容易误伤）
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
    0.08 * phr +        // ← 原来 0.18，现在 0.08
    0.06 * uniSent +
    0.04 * uniPara;

  let ai01 = sigmoid(12 * (raw - 0.30)); // 稍微更保守一点
  ai01 = clamp(ai01 + 0.10, 0, 1);       // 原来 +0.18 太猛

  // ✅ 原来强制拉满（0.90/0.97）会把人写学术顶到 100 ——删掉，改成温和加分
  const strongSignals = [
    phr > 0.34,
    nStart > 0.55,
    uniSent > 0.60,
    (nRep3 > 0.45 && nRep2 > 0.40),
    (nD4 > 0.55 && nRep2 > 0.35),
  ].filter(Boolean).length;

  ai01 = clamp(ai01 + 0.05 * strongSignals, 0, 1);

  // ✅ “人写学术保护阈”：如果 detector 明显偏 human，则 heuristic 不允许冲太高
  if (typeof detectorAi01 === "number" && detectorAi01 < 0.35) {
    ai01 = Math.min(ai01, 0.78);
  }

  // 长度置信度（短文更保守）
  const wCount = words.length;
  const conf = clamp((wCount - 80) / 420, 0, 1);
  ai01 = clamp(ai01 * (0.88 + 0.12 * conf), 0, 1);

  const ai = Math.round(ai01 * 100);

  const mixed01 = clamp(0.25 * (1 - Math.abs(ai01 - 0.62) / 0.62), 0, 0.30);
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
      detectorAi01,
    },
  };
}

// ====== ✅ 轻量 burstiness（逐句 detector 概率波动，不做 perplexity）======
const MAX_BURST_SENTENCES = 12;
const BURST_BUDGET_MS = 1200;

async function computeDetectorBurstiness(text: string) {
  const sents = splitSentences(text);
  const usable = sents.filter((s) => tokenizeWords(s).length >= 6).slice(0, MAX_BURST_SENTENCES);
  if (usable.length < 4) return { sentAi01: [] as number[], burstiness: 0, sentCount: usable.length };

  const classifier = await getTextClassifier();

  const t0 = Date.now();
  const sentAi01: number[] = [];
  for (const s of usable) {
    if (Date.now() - t0 > BURST_BUDGET_MS) break;
    try {
      const out = await classifier(s);
      const r = toAiProbFromClassifier(out);
      sentAi01.push(r.ai01);
    } catch {
      // skip
    }
  }

  const m = mean(sentAi01);
  const sd = std(sentAi01);
  const burstiness = m > 0 ? sd / m : 0;

  return { sentAi01, burstiness, sentCount: sentAi01.length };
}

// 越平滑（burstiness 越低）越像 AI
function burstinessToAi01(burstiness: number) {
  const smooth01 = clamp((0.18 - burstiness) / 0.18, 0, 1);
  return clamp(sigmoid(7 * (smooth01 - 0.45)), 0, 1);
}

function toThreeWay(ai01: number) {
  const gen = clamp(sigmoid(10 * (ai01 - 0.72)), 0, 1);
  const human = clamp(sigmoid(10 * (0.38 - ai01)), 0, 1);
  const refined = clamp(1 - gen - human, 0, 1);
  const s = gen + refined + human || 1;
  return { gen: gen / s, refined: refined / s, human: human / s };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; lang?: string };
    const text = (body?.text ?? "").trim();

    if (!text) return NextResponse.json({ ok: false, error: "Missing text." }, { status: 400 });
    if (hasNonEnglish(text)) return NextResponse.json({ ok: false, error: "Only English text is supported." }, { status: 400 });

    const words = countWords(text);
    if (words < 40) return NextResponse.json({ ok: false, error: "To analyze text, add at least 40 words." }, { status: 400 });

    // 句子级解释 + 短语高亮（保持）
    const sents = splitSentences(text);
    let cursor = 0;
    const sentenceResults = sents.map((s) => {
      const start = text.indexOf(s, cursor);
      const end = start === -1 ? -1 : start + s.length;
      if (end !== -1) cursor = end;
      return { text: s, start, end, ...scoreSentenceLite(s) };
    });

    const highlights = findPhraseHighlights(text);

    // roberta detector（全文）
    let detectorAi01: number | null = null;
    let modelAiGenerated: number | null = null;
    let modelMeta: any = null;

    try {
      const classifier = await getTextClassifier();
      const out = await classifier(text);
      const r = toAiProbFromClassifier(out);
      detectorAi01 = r.ai01;
      modelAiGenerated = Math.round(r.ai01 * 100);
      modelMeta = { model: MODEL_ID, label: r.label, confidence: r.conf };
    } catch (err: any) {
      detectorAi01 = null;
      modelAiGenerated = null;
      modelMeta = { model: MODEL_ID, error: err?.message ?? String(err) };
    }

    // ✅ 新 heuristic（不误伤学术）
    const { ai, mixed, human, debug } = scoreAiLikelihoodTamed(text, detectorAi01);

    // ✅ burstiness + ensemble（推荐 UI 用这个）
    let burstMeta: any = null;
    let ensembleAiGenerated: number | null = null;
    let ensembleThreeWay: any = null;

    try {
      const b = await computeDetectorBurstiness(text);
      const burstAi01 = burstinessToAi01(b.burstiness);

      const heuristicAi01 = clamp(ai / 100, 0, 1);
      const docAi01 = typeof detectorAi01 === "number" ? detectorAi01 : 0.55;

      // ensemble：doc detector 主导 + heuristic 辅助 + burstiness（更像 GPTZero 的“波动”概念）
      let ensembleAi01 = 0.62 * docAi01 + 0.28 * heuristicAi01 + 0.10 * burstAi01;

      // 短文更保守
      const lenConf = clamp((words - 80) / 420, 0, 1);
      ensembleAi01 = clamp(ensembleAi01 * (0.88 + 0.12 * lenConf), 0, 1);

      const three = toThreeWay(ensembleAi01);

      const gen = Math.round(three.gen * 100);
      const ref = Math.round(three.refined * 100);
      const hum = clamp(100 - gen - ref, 0, 100);

      ensembleAiGenerated = gen;
      ensembleThreeWay = { aiGenerated: gen, humanAiRefined: ref, humanWritten: hum };

      burstMeta = {
        maxSentences: MAX_BURST_SENTENCES,
        budgetMs: BURST_BUDGET_MS,
        sentCount: b.sentCount,
        sentAiGenerated: b.sentAi01.map((x) => Math.round(x * 100)),
        burstiness: b.burstiness,
        burstAiGenerated: Math.round(burstAi01 * 100),
      };
    } catch (err: any) {
      burstMeta = { error: err?.message ?? String(err) };
      ensembleAiGenerated = null;
      ensembleThreeWay = null;
    }

    return NextResponse.json({
      ok: true,

      // ✅ 你的主分（tamed heuristic）
      aiGenerated: ai,
      humanAiRefined: mixed,
      humanWritten: human,

      // ✅ 解释输出
      sentences: sentenceResults,
      highlights,

      // ✅ detector
      modelAiGenerated,
      modelMeta,

      // ✅ 推荐：更贴“商用”的最终分
      ensembleAiGenerated,
      ensembleThreeWay,
      burstMeta,

      meta: {
        words,
        provider: "heuristic-tamed + detector + burstiness",
        debug, // 线上不想暴露就删掉
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error." }, { status: 500 });
  }
}
