import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_DETECTOR_BASE_URL = "http://127.0.0.1:8000";

type DetectorUrlSource = "DETECTOR_URL" | "PY_DETECTOR_URL" | "DEFAULT";

function resolveDetectorTarget() {
  let source: DetectorUrlSource = "DEFAULT";
  let raw = DEFAULT_DETECTOR_BASE_URL;

  if (process.env.DETECTOR_URL?.trim()) {
    raw = process.env.DETECTOR_URL.trim();
    source = "DETECTOR_URL";
  } else if (process.env.PY_DETECTOR_URL?.trim()) {
    raw = process.env.PY_DETECTOR_URL.trim();
    source = "PY_DETECTOR_URL";
  }

  const parsed = new URL(raw);
  if (parsed.pathname === "/" || parsed.pathname === "") parsed.pathname = "/detect";
  return {
    url: parsed.toString(),
    host: parsed.hostname,
    path: parsed.pathname,
    source,
    isConfigured: source !== "DEFAULT",
  };
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
  if (msg.includes("ECONNREFUSED")) return "ECONNREFUSED";
  return "UNKNOWN";
}

async function runProbe(url: string, method: "HEAD" | "GET", timeoutMs: number) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { method, cache: "no-store", signal: controller.signal });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - started, method };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const requestId = randomUUID();
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", requestId }, { status: 401 });
    }

    if (process.env.NODE_ENV === "production") {
      const expected = process.env.AI_DETECTOR_DIAG_KEY?.trim();
      const provided = req.headers.get("x-ai-detector-diag-key")?.trim();
      if (!expected || provided !== expected) {
        return NextResponse.json({ ok: false, error: "DIAG_FORBIDDEN", requestId }, { status: 403 });
      }
    }

    const target = resolveDetectorTarget();
    const healthUrl = new URL(target.url);
    healthUrl.pathname = "/health";

    try {
      let probe = await runProbe(healthUrl.toString(), "HEAD", 1200);
      if (probe.status === 405 || probe.status === 404) {
        probe = await runProbe(healthUrl.toString(), "GET", 1200);
      }
      return NextResponse.json({
        ok: probe.ok,
        requestId,
        upstreamHost: target.host,
        upstreamPath: target.path,
        healthPath: healthUrl.pathname,
        detectorUrlSource: target.source,
        detectorUrlConfigured: target.isConfigured,
        probeMethod: probe.method,
        upstreamStatus: probe.status,
        latencyMs: probe.latencyMs,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          upstreamHost: target.host,
          upstreamPath: target.path,
          healthPath: healthUrl.pathname,
          detectorUrlSource: target.source,
          detectorUrlConfigured: target.isConfigured,
          errorCode: e?.name === "AbortError" ? "ABORT_TIMEOUT" : normalizeErrorCode(e),
          message: "Unable to reach detector health endpoint.",
        },
        { status: 503 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", requestId, message: e?.message ?? "Unknown error." },
      { status: 500 }
    );
  }
}
