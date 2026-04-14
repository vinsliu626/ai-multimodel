const PRODUCTION_SITE_URL = "https://ai-multimodel-erhw.vercel.app";
const DEVELOPMENT_SITE_URL = "http://localhost:3000";

const SITE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeSiteUrl(value: string) {
  return new URL(withProtocol(value.trim())).toString().replace(/\/$/, "");
}

function isLocalSeoHost(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

export function getSiteUrl() {
  for (const key of SITE_URL_ENV_KEYS) {
    const candidate = process.env[key];
    if (!candidate) continue;

    try {
      const normalized = new URL(normalizeSiteUrl(candidate));
      if (process.env.NODE_ENV === "production" && isLocalSeoHost(normalized)) {
        continue;
      }
      return normalized.toString().replace(/\/$/, "");
    } catch {
      continue;
    }
  }

  return process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : DEVELOPMENT_SITE_URL;
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}
