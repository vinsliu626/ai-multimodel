// scripts/test-ai-note.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const FILE = process.env.AI_NOTE_FILE || path.join(root, "tts_30m.webm");

// chunking / pacing
const CHUNK_SIZE = Number(process.env.AI_NOTE_CHUNK_SIZE || 2.5 * 1024 * 1024); // bytes
const CHUNK_SLEEP_MS = Number(process.env.AI_NOTE_CHUNK_SLEEP_MS || 250); // per chunk throttle
const POLL_MS = Number(process.env.AI_NOTE_POLL_MS || 1200); // finalize polling interval

// loop / timeouts
const MAX_STEPS = Number(process.env.AI_NOTE_MAX_STEPS || 2000); // long audio needs more
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_NOTE_TIMEOUT_MS || 120_000);
const FINALIZE_TIMEOUT_MS = Number(process.env.AI_NOTE_FINALIZE_TIMEOUT_MS || 600_000); // ✅ 10min default
const MAX_RETRIES = Number(process.env.AI_NOTE_MAX_RETRIES || 120); // robust retry ceiling

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms, ratio = 0.2) {
  const delta = ms * ratio;
  const j = (Math.random() * 2 - 1) * delta;
  return Math.max(0, Math.round(ms + j));
}

function redactCookie(s) {
  if (!s) return "";
  return s
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((kv) => {
      const i = kv.indexOf("=");
      if (i === -1) return kv;
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (v.length <= 12) return `${k}=${"*".repeat(v.length)}`;
      return `${k}=${v.slice(0, 6)}***${v.slice(-6)}`;
    })
    .join("; ");
}

function sanitizeCookie(raw) {
  if (!raw) return "";
  let s = String(raw);

  // remove dev markers like <<< >>> and other wrappers
  s = s.replace(/<<<+/g, "").replace(/>>>+/g, "");

  // remove CR/LF/TAB
  s = s.replace(/(\r\n|\n|\r)/g, "");
  s = s.replace(/\t/g, "");

  // compress spaces
  s = s.replace(/\s+/g, " ").trim();

  // normalize semicolons spacing
  s = s.replace(/;\s*/g, "; ").trim();

  // trim leading/trailing stray quotes
  s = s.replace(/^'+|'+$/g, "").replace(/^"+|"+$/g, "").trim();

  // final cleanup: remove duplicate separators
  s = s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("; ");

  return s;
}

function loadCookie() {
  // priority:
  // 1) process.env.COOKIE
  // 2) root/.cookie.txt
  let raw = process.env.COOKIE || "";

  const cookieFile = path.join(root, ".cookie.txt");
  if (!raw && fs.existsSync(cookieFile)) {
    raw = fs.readFileSync(cookieFile, "utf8");
  }

  const cookie = sanitizeCookie(raw);
  return cookie;
}

const COOKIE = loadCookie();

function previewBody(raw) {
  if (!raw) return "";
  const s = String(raw);
  return s.length <= 2000 ? s : s.slice(0, 2000) + "\n...(truncated)";
}

/**
 * ✅ Robust request:
 * - supports GET/POST
 * - retries on network/abort/empty body/json parse fail
 * - retries on 429 / 502 / 503 / 504 (and 503 LLM_FAILED)
 * - does NOT retry on 401/403
 */
async function requestWithRetry(method, url, body, opt = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelayMs = 1500,
    maxDelayMs = 60_000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    retryOnEmptyBody = true,
    retryOnJsonParseFail = true,
  } = opt;

  let attempt = 0;

  while (true) {
    attempt++;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    let res;
    let raw = "";
    let json = null;

    try {
      res = await fetch(url, {
        method,
        headers: {
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          Cookie: COOKIE,
          ...headers,
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: ac.signal,
      });

      raw = await res.text().catch(() => "");

      // ✅ 2xx but empty body => treat as retryable (prevents stage=undefined)
      if (res.ok && retryOnEmptyBody && (!raw || !raw.trim())) {
        throw new Error("EMPTY_RESPONSE_BODY");
      }

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        if (retryOnJsonParseFail) {
          throw new Error("JSON_PARSE_FAILED");
        }
        json = { raw };
      }
    } catch (e) {
      clearTimeout(t);

      const msg = String(e?.message || e);
      const retryable =
        msg.includes("aborted") ||
        msg.includes("AbortError") ||
        msg.includes("EMPTY_RESPONSE_BODY") ||
        msg.includes("JSON_PARSE_FAILED") ||
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("socket");

      if (!retryable || attempt > maxRetries) {
        throw new Error(`Network/timeout after ${attempt} attempts: ${msg}`);
      }

      const wait = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(10, attempt - 1));
      const w = jitter(wait);
      console.log(`⚠️ fetch failed (attempt ${attempt}), sleep ${w}ms then retry...`, msg);
      await sleep(w);
      continue;
    } finally {
      clearTimeout(t);
    }

    // Non-2xx log
    if (!res.ok) {
      console.log(`❌ ${method} ${url} -> status=${res.status}`);
      console.log("↩ raw:", previewBody(raw));
    }

    // 401/403 => hard fail (do not retry)
    if (res.status === 401) {
      throw new Error(
        `HTTP 401 AUTH_REQUIRED. Your COOKIE is not accepted by server.\n` +
          `COOKIE(preview): ${redactCookie(COOKIE)}\n` +
          `Tip: Put ONLY "name=value; name2=value2" into .cookie.txt or $env:COOKIE.\n` +
          `Do NOT include Path/Expires/HttpOnly/SameSite.`
      );
    }
    if (res.status === 403) {
      throw new Error(`HTTP 403 FORBIDDEN. Session exists but no permission.\nRaw: ${previewBody(raw)}`);
    }

    // 429 with retryAfterMs
    if (res.status === 429 && json?.extra?.retryAfterMs) {
      const ms = Number(json.extra.retryAfterMs) || 5000;
      const w = jitter(ms, 0.1);
      console.log(`⏳ rate limited(429), sleep ${w}ms then retry...`);
      await sleep(w);
      continue;
    }

    // 429 backoff
    if (res.status === 429) {
      if (attempt > maxRetries) throw new Error(`HTTP 429 after ${attempt} attempts: ${previewBody(raw)}`);
      const wait = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(10, attempt - 1));
      const w = jitter(wait);
      console.log(`⏳ 429, sleep ${w}ms then retry...`);
      await sleep(w);
      continue;
    }

    // 502/503/504 backoff (service shaky / long audio)
    if ([502, 503, 504].includes(res.status)) {
      // if LLM_FAILED, definitely retry; otherwise still retry (infra hiccup)
      const err = json?.error || "";
      const msg = String(json?.message || "");
      const isLlm = err === "LLM_FAILED" || msg.includes("Groq") || msg.includes("Failed to parse JSON");

      if (attempt > maxRetries) {
        throw new Error(`HTTP ${res.status}${isLlm ? "(LLM)" : ""} after ${attempt} attempts:\n${previewBody(raw)}`);
      }

      const wait = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(10, attempt - 1));
      const w = jitter(wait);
      console.log(`⏳ ${res.status}${isLlm ? " LLM" : ""}, sleep ${w}ms then retry...`);
      await sleep(w);
      continue;
    }

    // other errors
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${previewBody(raw)}`);
    }

    return json ?? {};
  }
}

async function getJsonWithRetry(url, opt = {}) {
  return requestWithRetry("GET", url, null, opt);
}

async function postJsonWithRetry(url, body, opt = {}) {
  return requestWithRetry("POST", url, body, opt);
}

/**
 * ✅ Verify cookie works:
 * - /api/auth/session should return { user, expires }
 */
async function assertAuthSession() {
  if (!COOKIE) {
    throw new Error(
      `COOKIE is empty.\n` +
        `Put cookie into:\n` +
        `  1) $env:COOKIE='name=value; name2=value2'\n` +
        `  or\n` +
        `  2) .cookie.txt (project root)\n`
    );
  }

  const url = `${BASE_URL}/api/auth/session`;
  const sess = await getJsonWithRetry(url, { timeoutMs: 30_000, maxRetries: 5 });

  const hasUser = !!sess?.user?.email || !!sess?.user?.name;
  if (!hasUser) {
    throw new Error(
      `Auth session is empty ({}). Server is clearing session-token.\n` +
        `- Your cookie is likely NOT the browser's current cookie, or it contains extra text (<<< >>> / newlines), or it's expired.\n` +
        `COOKIE(preview): ${redactCookie(COOKIE)}\n` +
        `Fix: Copy cookie from DevTools > Application > Cookies > http://localhost:3000 (name=value only), save into .cookie.txt`
    );
  }

  console.log(`✅ Auth OK as: ${sess.user?.email || sess.user?.name}, expires=${sess.expires}`);
}

async function uploadFileToNote() {
  if (!fs.existsSync(FILE)) throw new Error(`File not found: ${FILE}`);

  const buf = fs.readFileSync(FILE);
  const total = buf.length;
  const chunks = Math.ceil(total / CHUNK_SIZE);

  console.log(`Uploading: ${FILE}`);
  console.log(`Total bytes: ${total}, chunkSize: ${CHUNK_SIZE}, chunks: ${chunks}`);
  console.log(`Chunk sleep: ${CHUNK_SLEEP_MS}ms`);

  // 1) start session
  const start = await postJsonWithRetry(`${BASE_URL}/api/ai-note/start`, {}, { timeoutMs: 60_000 });
  if (!start?.ok || !start?.noteId) throw new Error(`start failed: ${JSON.stringify(start)}`);
  const noteId = start.noteId;

  // 2) upload chunks (with throttle)
  for (let i = 0; i < chunks; i++) {
    const from = i * CHUNK_SIZE;
    const to = Math.min(total, from + CHUNK_SIZE);
    const slice = buf.subarray(from, to);

    const payload = {
      noteId,
      chunkIndex: i,
      totalChunks: chunks,
      data: slice.toString("base64"),
      encoding: "base64",
      mime: "audio/webm",
    };

    console.log(`➡️ POST /api/ai-note/chunk chunk=${i} bytes=${slice.length}`);
    await postJsonWithRetry(`${BASE_URL}/api/ai-note/chunk`, payload, {
      timeoutMs: 180_000,
      maxRetries: 40,
    });
    console.log(`✅ Uploaded chunk ${i + 1}/${chunks} (${to}/${total})`);

    if (CHUNK_SLEEP_MS > 0) {
      await sleep(jitter(CHUNK_SLEEP_MS, 0.15));
    }
  }

  console.log(`Upload done. noteId=${noteId}`);
  return noteId;
}

async function runStepperFinalize(noteId) {
  console.log("Finalizing (stepper) ...");
  console.log(`Finalize timeout: ${FINALIZE_TIMEOUT_MS}ms, poll=${POLL_MS}ms, maxSteps=${MAX_STEPS}`);

  for (let step = 1; step <= MAX_STEPS; step++) {
    const json = await postJsonWithRetry(
      `${BASE_URL}/api/ai-note/finalize`,
      { noteId },
      {
        timeoutMs: FINALIZE_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        // ✅ finalize 最容易出现空响应/截断，强制重试
        retryOnEmptyBody: true,
        retryOnJsonParseFail: true,
      }
    );

    const stage = json?.stage;
    const progress = json?.progress;

    const debug = {
      asrNextIndex: json?.asrNextIndex,
      segmentsTotal: json?.segmentsTotal,
      llmNextPart: json?.llmNextPart,
      llmPartsTotal: json?.llmPartsTotal,
    };

    // ✅ 如果返回不带 stage，说明后端/网络刚刚抖了一下：继续轮询（不要当作成功）
    if (!stage) {
      console.log(`[${step}] (no stage) will poll again...`, debug);
      await sleep(POLL_MS);
      continue;
    }

    console.log(`[${step}] stage=${stage} progress=${progress}`, debug);

    if (stage === "done") {
      console.log("✅ DONE");
      const note = String(json?.note || "");
      console.log("secondsBilled:", json?.secondsBilled);
      console.log("note preview:\n", note.slice(0, 400), note.length > 400 ? "\n... (truncated)" : "");
      return;
    }

    if (stage === "failed") {
      throw new Error(`Job failed: ${JSON.stringify(json)}`);
    }

    await sleep(POLL_MS);
  }

  throw new Error(`Stepper exceeded MAX_STEPS=${MAX_STEPS}`);
}

async function main() {
  console.log("BASE_URL:", BASE_URL);
  console.log("AI_NOTE_FILE:", FILE);
  console.log("COOKIE(preview):", redactCookie(COOKIE));

  // ✅ must verify session first
  await assertAuthSession();

  const noteId = await uploadFileToNote();
  await runStepperFinalize(noteId);
}

main().catch((e) => {
  console.error("❌ test-ai-note failed:", e?.message || e);
  process.exit(1);
});
