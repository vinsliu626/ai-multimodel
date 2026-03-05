import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

function sanitizeCookie(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (/^cookie\s*:/i.test(s)) s = s.replace(/^cookie\s*:/i, "").trim();
  s = s.replace(/(\r\n|\n|\r)/g, "").replace(/\t/g, " ").trim();
  s = s.replace(/;\s*/g, "; ");
  return s;
}

function loadCookie() {
  const candidates = [
    process.env.COOKIE,
    readIfExists(path.join(ROOT, ".cookie.header.txt")),
    readIfExists(path.join(ROOT, ".cookie.txt")),
  ];
  for (const c of candidates) {
    const cookie = sanitizeCookie(c || "");
    if (cookie) return cookie;
  }
  return "";
}

function readIfExists(p) {
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function call(method, url, cookie) {
  const res = await fetch(url, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? "{}" : undefined,
  });
  const raw = await res.text();
  const json = safeJson(raw);
  return { status: res.status, raw, json };
}

async function main() {
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error("Cookie is empty. Put header string into .cookie.header.txt or set env COOKIE.");
  }

  const session = await call("GET", `${BASE_URL}/api/auth/session`, cookie);
  const start = await call("POST", `${BASE_URL}/api/ai-note/start`, cookie);

  const sessionUser = session.json?.user || null;
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`SESSION_STATUS=${session.status}`);
  console.log(`SESSION_HAS_USER=${Boolean(sessionUser)}`);
  console.log(`SESSION_BODY=${session.raw}`);
  console.log(`START_STATUS=${start.status}`);
  console.log(`START_BODY=${start.raw}`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
