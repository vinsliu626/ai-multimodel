import { describe, expect, it } from "vitest";
import { getStudyPlanLimits } from "@/lib/study/limits";
import { truncateStudyText } from "@/lib/study/service";

describe("study limits", () => {
  it("returns conservative limits for basic users", () => {
    const limits = getStudyPlanLimits("basic");
    expect(limits.generationsPerDay).toBe(1);
    expect(limits.maxFileSizeBytes).toBe(2 * 1024 * 1024);
    expect(limits.maxExtractedChars).toBe(8_000);
    expect(limits.maxQuizQuestions).toBe(5);
    expect(limits.allowedDifficulties).toEqual(["easy", "medium"]);
  });

  it("truncates long text near a sentence boundary", () => {
    const longText = `${"Sentence one. ".repeat(400)}Tail`;
    const result = truncateStudyText(longText, 400);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(400);
    expect(result.text.endsWith(".")).toBe(true);
  });
});
