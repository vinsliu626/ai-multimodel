export function countHumanizerWords(text: string): number {
  const normalized = String(text || "").trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

export function normalizeHumanizerInput(text: string): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[^\S\n]+/g, " ").replace(/\s*\n+\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function postprocessHumanizerOutput(text: string): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^```[\w-]*\n?/, "")
    .replace(/\n?```$/, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[^\S\n]+/g, " ").replace(/\s*\n+\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function sentenceCount(text: string): number {
  const normalized = normalizeHumanizerInput(text);
  if (!normalized) return 0;
  return normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function comparisonTokens(text: string): string[] {
  return normalizeHumanizerInput(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countPhraseMatches(text: string, phrases: string[]) {
  const normalized = ` ${normalizeHumanizerInput(text).toLowerCase()} `;
  return phrases.reduce((total, phrase) => total + (normalized.includes(` ${phrase} `) ? 1 : 0), 0);
}

export function wordOverlapRatio(original: string, edited: string): number {
  const originalTokens = comparisonTokens(original);
  const editedTokens = comparisonTokens(edited);
  if (originalTokens.length === 0 || editedTokens.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const token of editedTokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let shared = 0;
  for (const token of originalTokens) {
    const current = counts.get(token) ?? 0;
    if (current > 0) {
      shared += 1;
      counts.set(token, current - 1);
    }
  }

  return shared / originalTokens.length;
}

export function analyzeHumanizerEdit(original: string, edited: string) {
  const originalTokens = comparisonTokens(original);
  const editedTokens = comparisonTokens(edited);
  const overlapRatio = wordOverlapRatio(original, edited);
  const lengthRatio = originalTokens.length === 0 ? 0 : editedTokens.length / originalTokens.length;
  const sentenceRatio = sentenceCount(original) === 0 ? 0 : sentenceCount(edited) / sentenceCount(original);
  const paragraphDelta = Math.abs(
    normalizeHumanizerInput(original).split(/\n{2,}/).filter(Boolean).length -
      normalizeHumanizerInput(edited).split(/\n{2,}/).filter(Boolean).length
  );
  const transitionPhrases = ["moreover", "furthermore", "in today's world", "it is important to note"];
  const addedClicheCount = Math.max(0, countPhraseMatches(edited, transitionPhrases) - countPhraseMatches(original, transitionPhrases));

  return {
    overlapRatio,
    lengthRatio,
    sentenceRatio,
    paragraphDelta,
    addedClicheCount,
    tooAggressive:
      overlapRatio < 0.5 ||
      lengthRatio < 0.7 ||
      lengthRatio > 1.4 ||
      sentenceRatio < 0.6 ||
      sentenceRatio > 1.55 ||
      paragraphDelta > 1 ||
      (addedClicheCount > 0 && overlapRatio < 0.7),
  };
}
