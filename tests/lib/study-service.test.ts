import { describe, expect, it } from "vitest";
import { getStudyPlanLimits } from "@/lib/study/limits";
import { sanitizeStudyText, truncateStudyText } from "@/lib/study/service";

describe("study limits", () => {
  it("returns conservative limits for basic users", () => {
    const limits = getStudyPlanLimits("basic");
    expect(limits.generationsPerDay).toBe(1);
    expect(limits.maxFileSizeBytes).toBe(2 * 1024 * 1024);
    expect(limits.maxExtractedChars).toBe(8_000);
    expect(limits.maxQuizQuestions).toBe(10);
    expect(limits.allowedDifficulties).toEqual(["easy", "medium"]);
  });

  it("truncates long text near a sentence boundary", () => {
    const longText = `${"Sentence one. ".repeat(400)}Tail`;
    const result = truncateStudyText(longText, 400);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(400);
    expect(result.text.endsWith(".")).toBe(true);
  });

  it("preserves document structure and prioritizes question-rich sections when truncating", () => {
    const source = sanitizeStudyText(
      [
        "Chapter 1 overview\nKey ideas about metabolism and ATP.",
        "Question 1. Explain the relationship between ATP production and oxygen availability.\nQuestion 2. Compare aerobic and anaerobic respiration.",
        "Question 3. Why does mitochondrial membrane structure matter for energy transfer?\nQuestion 4. Apply this to muscle fatigue during sprinting.",
      ].join("\n\n")
    );

    const result = truncateStudyText(source, 260);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain("Question 1.");
    expect(result.text).toContain("Question 2.");
  });
});
