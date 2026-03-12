export function parseIntegerLike(value: string | undefined | null, fallback: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const match = raw.match(/^-?\d+/);
  if (!match) return fallback;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseEnvInt(name: string, fallback: number) {
  return parseIntegerLike(process.env[name], fallback);
}
