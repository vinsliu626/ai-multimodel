import { describe, expect, it } from "vitest";

import { deriveRecordedSeconds } from "@/lib/aiNote/recordingUsage";

describe("ai-note recording usage", () => {
  it("uses reported recording duration for billing", () => {
    const seconds = deriveRecordedSeconds({
      totalDurationMs: 3_650,
      sessionCreatedAt: new Date("2026-04-16T10:00:00.000Z"),
      nowMs: new Date("2026-04-16T10:00:05.000Z").getTime(),
    });

    expect(seconds).toBe(4);
  });

  it("falls back to server-observed session duration when client duration is missing", () => {
    const seconds = deriveRecordedSeconds({
      sessionCreatedAt: new Date("2026-04-16T10:00:00.000Z"),
      nowMs: new Date("2026-04-16T10:01:05.000Z").getTime(),
    });

    expect(seconds).toBe(65);
  });
});
