export type DetectorResult = { aiGenerated: number; humanAiRefined: number; humanWritten: number };
export type DetectorHighlight = { start: number; end: number; type?: string; label?: string; severity?: number; phrase?: string };
export type DetectorSentence = { text: string; start: number; end: number; aiScore: number; reasons: string[] };

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

export function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function approxWordCountBySlice(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ✅ 你原来的 buildCoverageHighlightsFromSentences 直接复制到这里
export function buildCoverageHighlightsFromSentences(
  fullText: string,
  sentences: DetectorSentence[],
  targetPct: number,
  opts?: { minSentenceScore?: number; contextSentences?: number; gapChars?: number; minBlockChars?: number }
): DetectorHighlight[] {
  const minSentenceScore = opts?.minSentenceScore ?? 35;
  const contextSentences = opts?.contextSentences ?? 1;
  const gapChars = opts?.gapChars ?? 40;
  const minBlockChars = opts?.minBlockChars ?? 20;

  const clean = (sentences || [])
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (!fullText || clean.length === 0) return [];

  const totalWords = countWords(fullText);
  const wantWords = Math.max(1, Math.round(totalWords * (clampPct(targetPct) / 100)));

  const ranked = clean
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => (b.s.aiScore ?? 0) - (a.s.aiScore ?? 0));

  const picked = new Set<number>();
  let pickedWords = 0;

  for (const item of ranked) {
    const score = Number(item.s.aiScore ?? 0);
    if (score < minSentenceScore) break;
    const slice = fullText.slice(item.s.start, item.s.end);
    const w = approxWordCountBySlice(slice);
    picked.add(item.idx);
    pickedWords += w;
    if (pickedWords >= wantWords) break;
  }

  if (pickedWords < wantWords) {
    for (const item of ranked) {
      if (picked.has(item.idx)) continue;
      const slice = fullText.slice(item.s.start, item.s.end);
      const w = approxWordCountBySlice(slice);
      picked.add(item.idx);
      pickedWords += w;
      if (pickedWords >= wantWords) break;
    }
  }

  if (picked.size === 0) return [];

  const pickedIdx = Array.from(picked).sort((a, b) => a - b);

  type Block = { i0: number; i1: number; maxScore: number };
  const blocks: Block[] = [];
  let cur: Block | null = null;

  for (const idx of pickedIdx) {
    if (!cur) {
      cur = { i0: idx, i1: idx, maxScore: clean[idx].aiScore ?? 0 };
      continue;
    }
    const prevEnd = clean[cur.i1].end;
    const nextStart = clean[idx].start;
    const closeEnough = nextStart - prevEnd <= gapChars;

    if (closeEnough) {
      cur.i1 = idx;
      cur.maxScore = Math.max(cur.maxScore, clean[idx].aiScore ?? 0);
    } else {
      blocks.push(cur);
      cur = { i0: idx, i1: idx, maxScore: clean[idx].aiScore ?? 0 };
    }
  }
  if (cur) blocks.push(cur);

  const expanded = blocks.map((b) => {
    const i0 = Math.max(0, b.i0 - contextSentences);
    const i1 = Math.min(clean.length - 1, b.i1 + contextSentences);
    return { start: clean[i0].start, end: clean[i1].end, maxScore: b.maxScore };
  });

  const results = expanded
    .map((b) => {
      const s = Math.max(0, Math.min(fullText.length, b.start));
      const e = Math.max(0, Math.min(fullText.length, b.end));
      return {
        start: s,
        end: e,
        type: "block",
        label: `AI-like block (max ${Math.round(b.maxScore)}%)`,
        severity: Math.max(0.1, Math.min(1, (b.maxScore ?? 0) / 100)),
      };
    })
    .filter((h) => h.end - h.start >= minBlockChars)
    .sort((a, b) => a.start - b.start);

  const merged: any[] = [];
  for (const h of results) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      last.severity = Math.max(last.severity ?? 0, h.severity ?? 0);
    } else {
      merged.push({ ...h });
    }
  }

  return merged;
}