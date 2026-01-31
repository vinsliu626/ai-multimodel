// lib/ui/format.ts
export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

export function fmtHours(seconds: number) {
  const h = seconds / 3600;
  if (h < 1) return `${Math.round(seconds / 60)} min`;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export function percent(used: number, limit: number | null) {
  if (limit == null || !Number.isFinite(limit)) return 0;
  if (limit <= 0) return 0;
  return clamp(Math.round((used / limit) * 100), 0, 100);
}