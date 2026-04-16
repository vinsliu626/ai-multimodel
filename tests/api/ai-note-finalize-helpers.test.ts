import { describe, expect, it } from "vitest";

import { buildProgressiveNote, isSkippedTranscript, nextUnprocessedIndex } from "@/lib/aiNote/finalizeHelpers";

describe("ai-note finalize helpers", () => {
  it("treats skipped transcript sentinels as processed", () => {
    const rows = [
      { chunkIndex: 0, text: "hello" },
      { chunkIndex: 1, text: '__AI_NOTE_ASR_SKIPPED__:{"cause":"timeout"}' },
      { chunkIndex: 3, text: "later" },
    ];

    expect(nextUnprocessedIndex(rows, 5)).toBe(2);
  });

  it("recognizes skipped transcript markers", () => {
    expect(isSkippedTranscript('__AI_NOTE_ASR_SKIPPED__:{"cause":"timeout"}')).toBe(true);
    expect(isSkippedTranscript("normal transcript")).toBe(false);
  });

  it("builds a progressive note draft from completed parts", () => {
    const draft = buildProgressiveNote(["## Part 1\nAlpha", "## Part 2\nBeta"]);
    expect(draft).toContain("# Note Draft");
    expect(draft).toContain("Alpha");
    expect(draft).toContain("Beta");
  });
});
