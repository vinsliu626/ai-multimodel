// lib/billing/time.ts
export function startOfTodayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

// Week starts on Monday 00:00 UTC
export function startOfThisWeekUTC() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = (day + 6) % 7; // Monday -> 0, Sunday -> 6
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday;
}
