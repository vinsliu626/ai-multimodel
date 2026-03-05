// app/api/ai-detector/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHash, randomUUID } from "crypto";

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";
import { canWaitWithinBudget, computeAttemptTimeoutMs, computeRetryDelayMs } from "@/lib/ai/retryBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_DETECTOR_BASE_URL = "http://127.0.0.1:8000";
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 120;
const RETRY_TOTAL_BUDGET_MS = 1500;
const RETRY_ATTEMPT_TIMEOUT_MS = 500;
const RETRY_TIMEOUT_SAFETY_MARGIN_MS = 40;
const RETRY_MIN_ATTEMPT_TIMEOUT_MS = 160;
const RETRY_JITTER_MAX_MS = 80;
const DETECTOR_CACHE_TTL_MS = 30_000;
const DETECTOR_CACHE_STALE_TTL_MS = 5 * 60_000;
const DETECTOR_MODEL_VERSION = "python-gpt2ppl-ai-overall + local-heuristic-explanations@v1";

let hasHandledAiDetectorRequest = false;

type DetectorSuccessPayload = {
  ok: true;
  aiGenerated: number;
  humanAiRefined: number;
  humanWritten: number;
  sentences: Array<{
    text: string;
    start: number;
    end: number;
    aiScore: number;
    reasons: string[];
  }>;
  highlights: Highlight[];
  python: {
    url: string;
    message: string;
    metrics: Record<string, any>;
  };
  meta: {
    words: number;
    timeoutMs: number;
    provider: string;
  };
};

type DetectorCacheEntry = {
  createdAt: number;
  expiresAt: number;
  payload: DetectorSuccessPayload;
};

const detectorResultCache = new Map<string, DetectorCacheEntry>();

class HttpRouteError extends Error {
  status: number;
  code: string;
  upstreamStatus?: number;
  errorCode?: string;
  transient?: boolean;
  retryCount?: number;
  upstreamBodySnippet?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    opts?: {
      upstreamStatus?: number;
      errorCode?: string;
      transient?: boolean;
      retryCount?: number;
      upstreamBodySnippet?: string;
    }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstreamStatus = opts?.upstreamStatus;
    this.errorCode = opts?.errorCode;
    this.transient = opts?.transient;
    this.retryCount = opts?.retryCount;
    this.upstreamBodySnippet = opts?.upstreamBodySnippet;
  }
}

// ---------- utils ----------
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasNonEnglish(text: string) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function isLocalUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

type DetectorUrlSource = "DETECTOR_URL" | "PY_DETECTOR_URL" | "DEFAULT";

type DetectorTarget = {
  url: string;
  host: string;
  path: string;
  source: DetectorUrlSource;
  isConfigured: boolean;
};

function resolveDetectorTarget(): DetectorTarget {
  let source: DetectorUrlSource = "DEFAULT";
  let raw = DEFAULT_DETECTOR_BASE_URL;

  if (process.env.DETECTOR_URL?.trim()) {
    raw = process.env.DETECTOR_URL.trim();
    source = "DETECTOR_URL";
  } else if (process.env.PY_DETECTOR_URL?.trim()) {
    raw = process.env.PY_DETECTOR_URL.trim();
    source = "PY_DETECTOR_URL";
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpRouteError(
      500,
      "DETECTOR_URL_INVALID",
      `Invalid DETECTOR_URL: "${raw}". Use a full URL like http://127.0.0.1:8000`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpRouteError(500, "DETECTOR_URL_INVALID", "DETECTOR_URL must start with http:// or https://");
  }

  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/detect";
  }

  return {
    url: parsed.toString(),
    host: parsed.hostname,
    path: parsed.pathname,
    source,
    isConfigured: source !== "DEFAULT",
  };
}

function detectorDownMessage(url: string) {
  if (isLocalUrl(url)) {
    return "Detector service not running. Start it with `npm run detector:dev`.";
  }
  return "Detector service is unavailable.";
}

function dbUnavailableMessage() {
  return "Database is temporarily unavailable. Ensure Postgres is running and retry.";
}

function dbUnavailableResponse() {
  return NextResponse.json(
    { ok: false, error: "DB_UNAVAILABLE", message: dbUnavailableMessage() },
    { status: 503 }
  );
}

function isConnectionRefused(error: any) {
  const causeCode = String(error?.cause?.code ?? "").toUpperCase();
  if (causeCode === "ECONNREFUSED") return true;
  const msg = String(error?.message ?? "").toUpperCase();
  return msg.includes("ECONNREFUSED");
}

function normalizeErrorCode(error: any) {
  const causeCode = String(error?.cause?.code ?? "").toUpperCase();
  if (causeCode) return causeCode;
  const ownCode = String(error?.code ?? "").toUpperCase();
  if (ownCode) return ownCode;
  const msg = String(error?.message ?? "").toUpperCase();
  if (msg.includes("SOCKET HANG UP")) return "SOCKET_HANG_UP";
  if (msg.includes("ECONNRESET")) return "ECONNRESET";
  if (msg.includes("ETIMEDOUT")) return "ETIMEDOUT";
  if (msg.includes("UND_ERR_CONNECT_TIMEOUT")) return "UND_ERR_CONNECT_TIMEOUT";
  return "";
}

function isTransientUpstreamStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

function isTransientErrorCode(code: string) {
  const normalized = code.toUpperCase();
  return (
    normalized === "ECONNRESET" ||
    normalized === "ETIMEDOUT" ||
    normalized === "UND_ERR_CONNECT_TIMEOUT" ||
    normalized === "SOCKET_HANG_UP"
  );
}

function cacheKeyForText(text: string) {
  const hash = createHash("sha256").update(text).digest("hex");
  return `${DETECTOR_MODEL_VERSION}:${hash}`;
}

function readDetectorCache(key: string) {
  const entry = detectorResultCache.get(key);
  if (!entry) return { fresh: null as DetectorSuccessPayload | null, stale: null as DetectorSuccessPayload | null };
  const now = Date.now();
  const staleAgeMs = now - entry.createdAt;
  if (staleAgeMs > DETECTOR_CACHE_STALE_TTL_MS) {
    detectorResultCache.delete(key);
    return { fresh: null as DetectorSuccessPayload | null, stale: null as DetectorSuccessPayload | null };
  }
  return {
    fresh: entry.expiresAt > now ? entry.payload : null,
    stale: entry.payload,
  };
}

function writeDetectorCache(key: string, payload: DetectorSuccessPayload) {
  const now = Date.now();
  detectorResultCache.set(key, { payload, createdAt: now, expiresAt: now + DETECTOR_CACHE_TTL_MS });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeSnippet(input: string, maxLen = 120) {
  return input.replace(/[^\x20-\x7E]+/g, " ").trim().slice(0, maxLen);
}

// ---------- heuristic pieces ----------
const AI_PHRASES = [
  "in conclusion","overall","moreover","furthermore","additionally",
  "it is important to note","this essay will","this paper will","this article will",
  "as a result","in summary","on the other hand","in terms of",
  "a key factor","plays a crucial role","it can be argued","this suggests that",
  "from this perspective","it is evident that",
  "as an ai","as a language model","i don't have personal","i cannot","i can't","i do not have access",
  "it's worth noting","it is worth noting","this highlights","this underscores",
  "from a young age","growing up","in my experience","throughout my life",
  "this experience taught me","i learned that","it made me realize",
];

function tokenizeWords(text: string) {
  const m = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
  return m ?? [];
}

function splitSentencesWithOffsets(text: string) {
  const out: { text: string; start: number; end: number }[] = [];
  const s = text.replace(/\r/g, "");
  let start = 0;

  const pushTrimmed = (rawStart: number, rawEnd: number) => {
    if (rawEnd <= rawStart) return;
    const rawSlice = s.slice(rawStart, rawEnd);
    const slice = rawSlice.trim();
    if (!slice) return;

    const leftTrim = rawSlice.match(/^\s*/)?.[0]?.length ?? 0;
    const rightTrim = rawSlice.match(/\s*$/)?.[0]?.length ?? 0;

    const realStart = rawStart + leftTrim;
    const realEnd = rawEnd - rightTrim;

    if (realEnd > realStart) {
      out.push({ text: s.slice(realStart, realEnd), start: realStart, end: realEnd });
    }
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isEndPunc = ch === "." || ch === "!" || ch === "?";
    const isNewline = ch === "\n";

    if (isEndPunc) {
      pushTrimmed(start, i + 1);
      start = i + 1;
      continue;
    }

    if (isNewline) {
      pushTrimmed(start, i);
      let j = i;
      while (j < s.length && s[j] === "\n") j++;
      start = j;
      i = j - 1;
      continue;
    }
  }

  if (start < s.length) pushTrimmed(start, s.length);
  return out;
}

function phraseHitRate(textLower: string) {
  let hits = 0;
  for (const p of AI_PHRASES) if (textLower.includes(p)) hits++;
  return clamp(hits / 3, 0, 1);
}

function ngramRepeatRate(words: string[], n: number) {
  if (words.length < n + 2) return 0;
  const total = words.length - n + 1;
  const freq = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const g = words.slice(i, i + n).join(" ");
    freq.set(g, (freq.get(g) ?? 0) + 1);
  }
  let repeated = 0;
  for (const [, c] of freq) if (c >= 2) repeated += c;
  return repeated / total;
}

function typeTokenRatio(words: string[]) {
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

function scoreSentenceLite(sentence: string) {
  const lower = sentence.toLowerCase();
  const w = tokenizeWords(sentence);

  const phr = phraseHitRate(lower);
  const rep2 = ngramRepeatRate(w, 2);
  const rep3 = ngramRepeatRate(w, 3);
  const ttr = typeTokenRatio(w);

  const sRaw =
    0.45 * phr +
    0.25 * clamp((rep2 - 0.03) / 0.12, 0, 1) +
    0.20 * clamp((rep3 - 0.015) / 0.08, 0, 1) +
    0.10 * clamp((0.62 - ttr) / 0.26, 0, 1);

  const aiScore = Math.round(clamp(sigmoid(10 * (sRaw - 0.25)) + 0.10, 0, 1) * 100);

  const reasons: string[] = [];
  if (phr > 0.2) reasons.push("Template phrases / transitions");
  if (rep3 > 0.05 || rep2 > 0.10) reasons.push("Repeated phrasing");
  if (ttr < 0.42) reasons.push("Low lexical variety");

  return { aiScore, reasons };
}

type Highlight = {
  start: number;
  end: number;
  type: "phrase";
  label: string;
  severity: number;
  phrase: string;
};

function findPhraseHighlights(text: string): Highlight[] {
  const lower = text.toLowerCase();
  const out: Highlight[] = [];

  for (const p of AI_PHRASES) {
    let idx = 0;
    while (true) {
      const hit = lower.indexOf(p, idx);
      if (hit === -1) break;
      out.push({
        start: hit,
        end: hit + p.length,
        type: "phrase",
        label: "Template phrase",
        severity: 0.85,
        phrase: p,
      });
      idx = hit + p.length;
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---------- Python client ----------
type PyDetectResponse = {
  ok: boolean;
  result: [
    {
      "AI overall"?: number;
      [k: string]: any;
    },
    string
  ];
};

type DetectorAttemptMetrics = {
  retries: number;
  attempts: number;
  upstreamStatus: number | null;
  errorCode: string | null;
  upstreamBodySnippet: string | null;
};

async function callPythonDetectorWithFastRetry(text: string, target: DetectorTarget, allowFastStaleFallback: boolean) {
  const deadlineMs = Date.now() + RETRY_TOTAL_BUDGET_MS;
  const metrics: DetectorAttemptMetrics = {
    retries: 0,
    attempts: 0,
    upstreamStatus: null,
    errorCode: null,
    upstreamBodySnippet: null,
  };

  let lastError: HttpRouteError | null = null;

  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    const attemptTimeout = computeAttemptTimeoutMs({
      deadlineMs,
      perAttemptCapMs: RETRY_ATTEMPT_TIMEOUT_MS,
      safetyMarginMs: RETRY_TIMEOUT_SAFETY_MARGIN_MS,
      minAttemptMs: RETRY_MIN_ATTEMPT_TIMEOUT_MS,
    });
    if (attemptTimeout == null) break;
    metrics.attempts = attempt;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), attemptTimeout);
    try {
      const res = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as PyDetectResponse;
        if (!data?.ok || !data?.result?.[0]) {
          throw new HttpRouteError(
            502,
            "DETECTOR_INVALID_RESPONSE",
            "Detector invalid response.",
            { upstreamStatus: 502, errorCode: "INVALID_RESPONSE", transient: false, retryCount: attempt - 1 }
          );
        }
        metrics.upstreamStatus = res.status;
        metrics.errorCode = null;
        return { data, detectorUrl: target.url, timeoutMs: attemptTimeout, metrics };
      }

      const body = await res.text().catch(() => "");
      const snippet = sanitizeSnippet(body, 120);
      metrics.upstreamStatus = res.status;
      metrics.errorCode = `HTTP_${res.status}`;
      metrics.upstreamBodySnippet = snippet || null;

      const transientHttp = isTransientUpstreamStatus(res.status);
      lastError = new HttpRouteError(
        transientHttp ? 503 : 502,
        transientHttp ? "DETECTOR_TRANSIENT_HTTP" : "DETECTOR_HTTP_ERROR",
        transientHttp
          ? `Detector transient HTTP ${res.status}.`
          : `Detector HTTP ${res.status}.`,
        {
          upstreamStatus: res.status,
          errorCode: `HTTP_${res.status}`,
          transient: transientHttp,
          retryCount: attempt - 1,
          upstreamBodySnippet: snippet || undefined,
        }
      );
      if (!transientHttp || attempt >= RETRY_MAX_ATTEMPTS) throw lastError;
      if (allowFastStaleFallback) throw lastError;
    } catch (e: any) {
      if (e instanceof HttpRouteError) {
        lastError = e;
      } else {
        const errorCode = e?.name === "AbortError" ? "ABORT_TIMEOUT" : normalizeErrorCode(e);
        const isRefused = isConnectionRefused(e);
        const transient = e?.name === "AbortError" || isRefused || isTransientErrorCode(errorCode);
        const status = e?.name === "AbortError" ? 504 : isRefused ? 503 : transient ? 503 : 502;
        const code = e?.name === "AbortError"
          ? "DETECTOR_TIMEOUT"
          : isRefused
            ? "DETECTOR_UNAVAILABLE"
            : transient
              ? "DETECTOR_FETCH_FAILED"
              : "DETECTOR_FETCH_ERROR";
        const message = e?.name === "AbortError"
          ? "Detector request timed out."
          : isRefused
            ? detectorDownMessage(target.url)
            : transient
              ? "Detector upstream connection failed."
              : "Detector fetch failed.";

        metrics.upstreamStatus = status;
        metrics.errorCode = errorCode || code;
        lastError = new HttpRouteError(status, code, message, {
          upstreamStatus: status,
          errorCode: errorCode || code,
          transient,
          retryCount: attempt - 1,
        });
      }
      if (!lastError.transient || attempt >= RETRY_MAX_ATTEMPTS) throw lastError;
      if (allowFastStaleFallback) throw lastError;
    } finally {
      clearTimeout(timer);
    }

    const waitMs = computeRetryDelayMs({
      baseDelayMs: RETRY_BASE_DELAY_MS,
      attempt,
      jitterMaxMs: RETRY_JITTER_MAX_MS,
    });
    if (!canWaitWithinBudget(waitMs, deadlineMs, RETRY_TIMEOUT_SAFETY_MARGIN_MS)) break;
    metrics.retries += 1;
    await sleep(waitMs);
  }

  if (lastError) {
    throw new HttpRouteError(
      lastError.status === 502 ? 503 : lastError.status,
      lastError.code,
      `Detector unavailable within ${RETRY_TOTAL_BUDGET_MS}ms budget.`,
      {
        upstreamStatus: lastError.upstreamStatus ?? lastError.status,
        errorCode: lastError.errorCode ?? lastError.code,
        transient: true,
        retryCount: metrics.retries,
        upstreamBodySnippet: lastError.upstreamBodySnippet,
      }
    );
  }

  throw new HttpRouteError(504, "DETECTOR_RETRY_BUDGET_EXCEEDED", "Detector retry budget exhausted.", {
    upstreamStatus: metrics.upstreamStatus ?? 504,
    errorCode: metrics.errorCode ?? "BUDGET_EXHAUSTED",
    transient: true,
    retryCount: metrics.retries,
    upstreamBodySnippet: metrics.upstreamBodySnippet ?? undefined,
  });
}

// ---------- route ----------
export async function POST(req: Request) {
  const requestId = randomUUID();
  const coldStartLikely = !hasHandledAiDetectorRequest;
  hasHandledAiDetectorRequest = true;
  const requestStartedAt = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  let authMs = 0;
  let dbMs = 0;
  let detectorFetchMs = 0;
  let retryCount = 0;
  let upstreamStatus: number | null = null;
  let errorCode: string | null = null;
  let upstreamBodySnippet: string | null = null;
  let upstreamHost: string | null = null;
  let upstreamPath: string | null = null;
  let detectorUrlSource: DetectorUrlSource | null = null;
  let detectorUrlConfigured: boolean | null = null;
  let cacheHeader: "hit" | "hit-stale" | "miss" = "miss";
  let responseStatus = 500;

  const finish = (res: NextResponse) => {
    const totalMs = Date.now() - requestStartedAt;
    responseStatus = res.status;
    if (isProduction) {
      res.headers.set("x-ai-detector-request-id", requestId);
      res.headers.set("x-ai-detector-retries", String(retryCount));
      res.headers.set("x-ai-detector-total-ms", String(totalMs));
      if (cacheHeader !== "miss") res.headers.set("x-ai-detector-cache", cacheHeader);
    }

    console.info(
      JSON.stringify({
        event: "ai_detector_request",
        requestId,
        coldStartLikely,
        totalMs,
        status: responseStatus,
        upstreamStatus,
        errorCode,
        upstreamBodySnippet,
        upstreamHost,
        upstreamPath,
        detectorUrlSource,
        detectorUrlConfigured,
        phases: {
          authMs,
          dbMs,
          detectorFetchMs,
          retryCount,
        },
        cache: cacheHeader,
      })
    );
    return res;
  };

  try {
    const authStart = Date.now();
    const session = await getServerSession(authOptions);
    authMs = Date.now() - authStart;
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      return finish(NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 }));
    }

    const body = (await req.json()) as { text?: string; lang?: string };
    const text = (body?.text ?? "").trim();

    if (!text) return finish(NextResponse.json({ ok: false, error: "Missing text." }, { status: 400 }));
    if (hasNonEnglish(text)) {
      return finish(NextResponse.json({ ok: false, error: "Only English text is supported." }, { status: 400 }));
    }

    const words = countWords(text);
    if (words < 40) {
      return finish(NextResponse.json({ ok: false, error: "To analyze text, add at least 40 words." }, { status: 400 }));
    }

    const dbStart = Date.now();
    try {
      await withPrismaConnectionRetry(
        () => assertQuotaOrThrow({ userId, action: "detector", amount: words }),
        { maxRetries: 2, retryDelayMs: 200 }
      );
    } catch (e) {
      dbMs = Date.now() - dbStart;
      if (e instanceof QuotaError) {
        return finish(NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: 429 }));
      }
      if (isTransientPrismaConnectionError(e)) {
        errorCode = "DB_UNAVAILABLE";
        upstreamStatus = 503;
        return finish(dbUnavailableResponse());
      }
      throw e;
    }
    dbMs = Date.now() - dbStart;

    const sents = splitSentencesWithOffsets(text);
    const sentenceResults = sents.map((seg) => ({
      text: seg.text,
      start: seg.start,
      end: seg.end,
      ...scoreSentenceLite(seg.text),
    }));

    const highlights = findPhraseHighlights(text);
    const detectorTarget = resolveDetectorTarget();
    upstreamHost = detectorTarget.host;
    upstreamPath = detectorTarget.path;
    detectorUrlSource = detectorTarget.source;
    detectorUrlConfigured = detectorTarget.isConfigured;

    const cacheKey = cacheKeyForText(text);
    const cacheLookup = readDetectorCache(cacheKey);
    if (cacheLookup.fresh) {
      cacheHeader = "hit";
      return finish(NextResponse.json(cacheLookup.fresh));
    }

    const detectorStart = Date.now();
    let py: Awaited<ReturnType<typeof callPythonDetectorWithFastRetry>>;
    try {
      py = await callPythonDetectorWithFastRetry(text, detectorTarget, Boolean(cacheLookup.stale));
      retryCount = py.metrics.retries;
      upstreamStatus = py.metrics.upstreamStatus ?? 200;
      errorCode = py.metrics.errorCode;
      upstreamBodySnippet = py.metrics.upstreamBodySnippet;
    } catch (e) {
      detectorFetchMs = Date.now() - detectorStart;
      if (e instanceof HttpRouteError) {
        retryCount = e.retryCount ?? retryCount;
        upstreamStatus = e.upstreamStatus ?? e.status;
        errorCode = e.errorCode ?? e.code;
        upstreamBodySnippet = e.upstreamBodySnippet ?? null;

        if (cacheLookup.stale) {
          cacheHeader = "hit-stale";
          return finish(NextResponse.json(cacheLookup.stale));
        }
        return finish(NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status }));
      }
      throw e;
    }
    detectorFetchMs = Date.now() - detectorStart;
    const metrics = py.data.result[0];
    const aiOverallRaw = Number(metrics?.["AI overall"]);

    if (!Number.isFinite(aiOverallRaw)) {
      errorCode = "DETECTOR_INVALID_RESPONSE";
      upstreamStatus = 502;
      return finish(NextResponse.json({ ok: false, error: "Python detector did not return AI overall." }, { status: 502 }));
    }

    const aiGenerated = clamp(Math.round(aiOverallRaw), 0, 100);
    const humanAiRefined = 0;
    const humanWritten = clamp(100 - aiGenerated, 0, 100);

    await withPrismaConnectionRetry(() => addUsageEvent(userId, "detector_words", words), {
      maxRetries: 2,
      retryDelayMs: 200,
    }).catch((err) =>
      console.error("[detector] usageEvent write failed:", err)
    );

    const payload: DetectorSuccessPayload = {
      ok: true,
      aiGenerated,
      humanAiRefined,
      humanWritten,
      sentences: sentenceResults,
      highlights,
      python: {
        url: py.detectorUrl,
        message: py.data.result[1],
        metrics,
      },
      meta: {
        words,
        timeoutMs: py.timeoutMs,
        provider: "python-gpt2ppl-ai-overall + local-heuristic-explanations",
      },
    };

    writeDetectorCache(cacheKey, payload);
    return finish(NextResponse.json(payload));
  } catch (e: any) {
    if (e instanceof HttpRouteError) {
      upstreamStatus = e.upstreamStatus ?? e.status;
      errorCode = e.errorCode ?? e.code;
      upstreamBodySnippet = e.upstreamBodySnippet ?? null;
      return finish(NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status }));
    }
    if (isTransientPrismaConnectionError(e)) {
      upstreamStatus = 503;
      errorCode = "DB_UNAVAILABLE";
      return finish(dbUnavailableResponse());
    }
    errorCode = normalizeErrorCode(e) || "INTERNAL_ERROR";
    return finish(NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: e?.message ?? "Unknown error." },
      { status: 500 }
    ));
  }
}
