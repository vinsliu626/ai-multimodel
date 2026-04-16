import { describe, expect, it } from "vitest";

import { computeRms, createSpeechSegmenter } from "@/components/workspace/note/audioVad";

describe("audio VAD helpers", () => {
  it("computes RMS energy", () => {
    expect(computeRms(new Float32Array([0, 0, 0, 0]))).toBe(0);
    expect(computeRms(new Float32Array([1, -1, 1, -1]))).toBe(1);
  });

  it("skips silent slices and keeps padding around speech", () => {
    const segmenter = createSpeechSegmenter<string>({
      sliceMs: 250,
      silenceMs: 750,
      preSpeechPadMs: 250,
      postSpeechPadMs: 250,
    });

    expect(segmenter.push({ value: "s0", hasSpeech: false })).toBeNull();
    expect(segmenter.push({ value: "s1", hasSpeech: false })).toBeNull();
    expect(segmenter.push({ value: "v0", hasSpeech: true })).toBeNull();
    expect(segmenter.push({ value: "v1", hasSpeech: true })).toBeNull();
    expect(segmenter.push({ value: "t0", hasSpeech: false })).toBeNull();
    expect(segmenter.push({ value: "t1", hasSpeech: false })).toBeNull();
    expect(segmenter.push({ value: "t2", hasSpeech: false })).toBeNull();

    const segment = segmenter.push({ value: "t3", hasSpeech: false });
    expect(segment).not.toBeNull();
    expect(segment?.sequenceIndex).toBe(0);
    expect(segment?.slices).toEqual(["s1", "v0", "v1", "t0"]);
  });

  it("flushes a final speech segment when recording stops", () => {
    const segmenter = createSpeechSegmenter<string>({
      sliceMs: 250,
      silenceMs: 650,
      preSpeechPadMs: 250,
      postSpeechPadMs: 250,
    });

    segmenter.push({ value: "lead", hasSpeech: false });
    segmenter.push({ value: "speech", hasSpeech: true });

    const segment = segmenter.flush();
    expect(segment?.sequenceIndex).toBe(0);
    expect(segment?.slices).toEqual(["lead", "speech"]);
  });

  it("caps long continuous speech at the configured max segment size", () => {
    const segmenter = createSpeechSegmenter<string>({
      sliceMs: 250,
      silenceMs: 650,
      preSpeechPadMs: 250,
      postSpeechPadMs: 250,
      maxSegmentMs: 1000,
    });

    expect(segmenter.push({ value: "a", hasSpeech: true })).toBeNull();
    expect(segmenter.push({ value: "b", hasSpeech: true })).toBeNull();
    expect(segmenter.push({ value: "c", hasSpeech: true })).toBeNull();
    const segment = segmenter.push({ value: "d", hasSpeech: true });

    expect(segment?.sequenceIndex).toBe(0);
    expect(segment?.slices).toEqual(["a", "b", "c", "d"]);
  });
});
