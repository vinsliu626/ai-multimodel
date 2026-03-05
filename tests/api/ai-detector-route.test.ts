import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const assertQuotaOrThrow = vi.fn();
  const addUsageEvent = vi.fn();
  return { getServerSession, assertQuotaOrThrow, addUsageEvent };
});

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/billing/guard", () => ({
  assertQuotaOrThrow: mocks.assertQuotaOrThrow,
  QuotaError: class QuotaError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 429) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/billing/usage", () => ({
  addUsageEvent: mocks.addUsageEvent,
}));

const LONG_TEXT =
  "This local detector route test sends enough words to pass the minimum threshold and exercise the full API flow for detector fetch and database quota handling under local development conditions. The payload also ensures sentence segmentation runs, heuristic scoring executes, and response fields are populated before assertions validate status mapping for service errors.";

describe("POST /api/ai-detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_test" } });
    mocks.assertQuotaOrThrow.mockResolvedValue(undefined);
    mocks.addUsageEvent.mockResolvedValue(undefined);
    process.env.DETECTOR_URL = "http://127.0.0.1:8000";
  });

  it("returns 503 when detector is not running (ECONNREFUSED)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    );

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LONG_TEXT }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("DETECTOR_UNAVAILABLE");
  });

  it("returns 504 when detector request times out", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue({ name: "AbortError", message: "The operation was aborted" });

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LONG_TEXT }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(504);
    expect(json.error).toBe("DETECTOR_TIMEOUT");
  });

  it("returns 503 when DB is unavailable during quota check", async () => {
    mocks.assertQuotaOrThrow.mockRejectedValue({
      code: "E57P01",
      message: "terminating connection due to administrator command",
    });

    const fetchSpy = vi.spyOn(global, "fetch");

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LONG_TEXT }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("DB_UNAVAILABLE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 200 when detector and DB are available", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            "AI overall": 42,
          },
          "ok",
        ],
      }),
    } as Response);

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LONG_TEXT }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.aiGenerated).toBe(42);
  });
});
