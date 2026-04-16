export const AI_NOTE_ASR_SKIPPED_PREFIX = "__AI_NOTE_ASR_SKIPPED__:";

export function isSkippedTranscript(text: string) {
  return text.startsWith(AI_NOTE_ASR_SKIPPED_PREFIX);
}

export function nextUnprocessedIndex(rows: { chunkIndex: number; text: string }[], total: number) {
  const processed = new Set(
    rows
      .filter((row) => String(row.text || "").trim().length > 0)
      .map((row) => row.chunkIndex)
  );

  for (let index = 0; index < total; index += 1) {
    if (!processed.has(index)) return index;
  }
  return total;
}

export function buildProgressiveNote(parts: string[]) {
  const cleaned = parts.map((part) => String(part || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return "";

  return [
    "# Note Draft",
    "",
    "_Completed sections are shown below while the final note is being merged._",
    "",
    cleaned.join("\n\n---\n\n"),
  ].join("\n");
}
