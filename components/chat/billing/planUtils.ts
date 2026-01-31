export type PlanId = "basic" | "pro" | "ultra" | "gift";

export function formatSecondsToHrs(sec: number) {
  const h = sec / 3600;
  if (h < 1) return `${Math.round((sec / 60) * 10) / 10}m`;
  return `${Math.round(h * 10) / 10}h`;
}

export function formatLimitSeconds(sec: number | null) {
  if (sec === null) return "∞";
  return formatSecondsToHrs(sec);
}

export function planLabel(plan: PlanId, isZh: boolean) {
  if (plan === "gift") return isZh ? "礼包无限制" : "Gift Unlimited";
  if (plan === "ultra") return "Ultra Pro";
  if (plan === "pro") return "Pro";
  return isZh ? "Basic（免费）" : "Basic (Free)";
}