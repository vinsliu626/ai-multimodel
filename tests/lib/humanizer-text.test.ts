import { describe, expect, it } from "vitest";
import { analyzeHumanizerEdit, countHumanizerWords, normalizeHumanizerInput, postprocessHumanizerOutput, wordOverlapRatio } from "@/lib/humanizer/text";
import { getHumanizerPlanLimits } from "@/lib/plans/productLimits";

describe("humanizer text helpers", () => {
  it("normalizes whitespace while preserving paragraphs", () => {
    expect(normalizeHumanizerInput(" One   two \nthree \n\n Four\tfive ")).toBe("One two three\n\nFour five");
  });

  it("cleans fenced output from the model", () => {
    expect(postprocessHumanizerOutput("```text\nOne  two\n\nThree\n```")).toBe("One two\n\nThree");
  });

  it("counts words consistently", () => {
    expect(countHumanizerWords("Alpha beta   gamma")).toBe(3);
  });

  it("detects when an edit is too aggressive", () => {
    const analysis = analyzeHumanizerEdit(
      "The experiment produced stable results after the second trial.",
      "After additional evaluation, the study yielded consistently reliable outcomes in the later phase."
    );
    expect(analysis.tooAggressive).toBe(true);
    expect(analysis.overlapRatio).toBeLessThan(0.62);
  });

  it("keeps high overlap for light edits", () => {
    expect(wordOverlapRatio("This draft is mostly clear but a little stiff.", "This draft is mostly clear, but a little stiff.")).toBeGreaterThan(0.8);
  });

  it("flags edits that split a simple sentence into overly reworked prose", () => {
    const analysis = analyzeHumanizerEdit(
      "The rollout was late, but the team fixed the main issues before launch.",
      "The rollout happened later than expected. Even so, the team was able to address the primary concerns ahead of the official launch."
    );
    expect(analysis.tooAggressive).toBe(true);
    expect(analysis.sentenceRatio).toBeGreaterThan(1);
  });

  it("allows restrained sentence-level cleanup", () => {
    const analysis = analyzeHumanizerEdit(
      "The rollout was late but the team fixed the main issues before launch.",
      "The rollout was late, but the team fixed the main issues before launch."
    );
    expect(analysis.tooAggressive).toBe(false);
    expect(analysis.overlapRatio).toBeGreaterThan(0.85);
  });
});

describe("humanizer plan limits", () => {
  it("exposes the expected weekly and per-request quotas", () => {
    expect(getHumanizerPlanLimits("basic")).toMatchObject({ wordsPerWeek: 3500, maxInputWords: 600, minInputWords: 20 });
    expect(getHumanizerPlanLimits("pro")).toMatchObject({ wordsPerWeek: 15000, maxInputWords: 1200, minInputWords: 20 });
    expect(getHumanizerPlanLimits("ultra")).toMatchObject({ wordsPerWeek: 35000, maxInputWords: 2000, minInputWords: 20 });
  });
});
