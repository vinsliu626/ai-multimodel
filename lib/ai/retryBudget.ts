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

export function canWaitWithinBudget(delayMs: number, deadlineMs: number, safetyMarginMs: number) {
  return Date.now() + delayMs + safetyMarginMs < deadlineMs;
}

export function adaptiveAttemptCapMs(attempt: number) {
  if (attempt <= 1) return 1200;
  if (attempt === 2) return 260;
  return 180;
}
