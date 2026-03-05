import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

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
  "This integration test hits a local detector stub using real HTTP from the ai detector route. The text is intentionally long so it exceeds the eighty word minimum required by the upstream contract. We are validating that route level auth checks, quota guards, retry setup, detector request serialization, and response parsing all cooperate without external network dependencies. The test focuses on local determinism and should remain stable across development runs. Additional words are included here only to ensure the input remains above threshold regardless of tokenizer behavior.";

let port = 0;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/detect") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const payload = JSON.parse(body || "{}");
        const text = String(payload?.text ?? "");
        const words = text.split(/\s+/).filter(Boolean).length;
        if (words < 80) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Need at least 80 words for stable detection." }));
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ok: true,
            result: [{ "AI overall": 37, source: "integration-local-stub" }, "ok"],
          })
        );
      });
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        port = address.port;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("POST /api/ai-detector local integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_test" } });
    mocks.assertQuotaOrThrow.mockResolvedValue(undefined);
    mocks.addUsageEvent.mockResolvedValue(undefined);
    process.env.DETECTOR_URL = `http://127.0.0.1:${port}/detect`;
  });

  it("returns 200 using local detector stub over real HTTP", async () => {
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
    expect(json.aiGenerated).toBe(37);
    expect(json.python?.metrics?.source).toBe("integration-local-stub");
  });
});
