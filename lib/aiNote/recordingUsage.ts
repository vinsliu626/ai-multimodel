export function parseRecordedDurationMs(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.round(num));
}

export function deriveRecordedSeconds(input: {
  totalDurationMs?: unknown;
  sessionCreatedAt?: Date | string | null;
  nowMs?: number;
}) {
  const reportedMs = parseRecordedDurationMs(input.totalDurationMs);
  const nowMs = input.nowMs ?? Date.now();
  const sessionMs =
    input.sessionCreatedAt instanceof Date
      ? input.sessionCreatedAt.getTime()
      : input.sessionCreatedAt
      ? new Date(input.sessionCreatedAt).getTime()
      : Number.NaN;
  const observedMs = Number.isFinite(sessionMs) ? Math.max(0, nowMs - sessionMs) : null;

  // Prefer the client-reported wall-clock duration, but reject obviously impossible overreports.
  const effectiveMs =
    reportedMs !== null
      ? observedMs !== null
        ? Math.min(reportedMs, observedMs + 5 * 60_000)
        : reportedMs
      : observedMs ?? 0;

  return Math.max(1, Math.ceil(effectiveMs / 1000));
}
