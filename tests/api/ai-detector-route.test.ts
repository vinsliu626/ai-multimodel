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
  "This local detector route test sends enough words to pass the minimum threshold and exercise the full API flow for detector fetch and database quota handling under local development conditions. The payload also ensures sentence segmentation runs, heuristic scoring executes, and response fields are populated before assertions validate status mapping for service errors. We intentionally add several more sentences so the text always exceeds eighty words for compatibility with the remote Hugging Face contract. Additional wording here is plain and repetitive on purpose because the test only verifies integration behavior, not linguistic quality. This sentence exists to make the input safely long enough.";

function testText(tag: string) {
  return `${LONG_TEXT} ${tag} ${Date.now()}`;
}

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
      body: JSON.stringify({ text: testText("refused") }),
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
      body: JSON.stringify({ text: testText("timeout") }),
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
      body: JSON.stringify({ text: testText("db-unavailable") }),
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
      status: 200,
      text: async () =>
        JSON.stringify({
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
      body: JSON.stringify({ text: testText("available") }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.aiGenerated).toBe(42);
  });

  it("treats HF 405 probe as reachable and continues with detector POST", async () => {
    process.env.DETECTOR_URL = "https://vins0629-py-detector.hf.space/detect";
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
        text: async () => '{"detail":"Method Not Allowed"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: [
              {
                "AI overall": 61,
              },
              "ok",
            ],
          }),
      } as Response);

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: testText("hf-405") }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("retries once on transient upstream 502 and succeeds within budget", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => "<html>bad gateway</html>",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: [
              {
                "AI overall": 55,
              },
              "ok",
            ],
          }),
      } as Response);

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: testText("retry-502") }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.meta?.retryCount).toBe(1);
    expect(json.meta?.attemptCount).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("uses dev remote fallback when local detector is unavailable", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL;
    process.env.NODE_ENV = "development";
    process.env.AI_DETECTOR_DISABLE_DEV_FALLBACK = "0";
    delete process.env.VERCEL;
    process.env.DETECTOR_URL = "http://127.0.0.1:8000/detect";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: [
              {
                "AI overall": 49,
              },
              "ok",
            ],
          }),
      } as Response);

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: testText("dev-fallback") }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.aiGenerated).toBe(49);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(String(fetchSpy.mock.calls[3]?.[0])).toContain("vins0629-py-detector.hf.space");

    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL = prevVercel;
  });

  it("uses remote fallback in local production mode when not on Vercel", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL;
    process.env.NODE_ENV = "production";
    process.env.AI_DETECTOR_DISABLE_DEV_FALLBACK = "0";
    delete process.env.VERCEL;
    process.env.DETECTOR_URL = "http://127.0.0.1:8000/detect";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            result: [
              {
                "AI overall": 51,
              },
              "ok",
            ],
          }),
      } as Response);

    const { POST } = await import("@/app/api/ai-detector/route");
    const req = new Request("http://localhost/api/ai-detector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: testText("prod-local-fallback") }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.aiGenerated).toBe(51);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(String(fetchSpy.mock.calls[3]?.[0])).toContain("vins0629-py-detector.hf.space");

    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL = prevVercel;
  });
});
