export function computeAttemptTimeoutMs(params: {
  deadlineMs: number;
  perAttemptCapMs: number;
  safetyMarginMs: number;
  minAttemptMs: number;
}) {
  const remainingBudgetMs = params.deadlineMs - Date.now();
  const candidate = Math.min(params.perAttemptCapMs, remainingBudgetMs - params.safetyMarginMs);
  if (candidate < params.minAttemptMs) return null;
  return Math.max(params.minAttemptMs, candidate);
}

export function computeRetryDelayMs(params: {
  baseDelayMs: number;
  attempt: number;
  jitterMaxMs: number;
}) {
  return params.baseDelayMs * params.attempt + Math.floor(Math.random() * params.jitterMaxMs);
}

export function adaptiveAttemptCapMs(attempt: number) {
  if (attempt <= 1) return 1000;
  if (attempt === 2) return 360;
  return 220;
}
