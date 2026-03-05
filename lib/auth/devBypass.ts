export function devBypassUserId(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.AI_NOTE_DEV_BYPASS_AUTH !== "true") return null;
  return process.env.AI_NOTE_DEV_USER_ID || "dev-user";
}
