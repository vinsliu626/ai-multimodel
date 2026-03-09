import crypto from "crypto";

let warnedMissingSecret = false;
let warnedInvalidSecret = false;

const DISALLOWED_PROMO_SECRETS = new Set([
  "replace-with-long-random-secret",
  "dev-secret",
  "test-secret",
  "default-secret",
]);

function isDisallowedSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return DISALLOWED_PROMO_SECRETS.has(normalized);
}

function readPromoSecret(): string {
  const value = process.env.PROMO_CODE_SECRET?.trim() ?? "";
  if (!value) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error("[promo] Missing required env var: PROMO_CODE_SECRET. Set it in .env.local or your deployment env.");
    }
    throw new Error("PROMO_CONFIG_MISSING_SECRET");
  }
  if (isDisallowedSecret(value)) {
    if (!warnedInvalidSecret) {
      warnedInvalidSecret = true;
      console.error("[promo] Invalid PROMO_CODE_SECRET configured. Replace placeholder/default secret with a real random value.");
    }
    throw new Error("PROMO_CONFIG_INVALID_SECRET");
  }
  return value;
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function hashPromoCode(rawCode: string): string {
  const normalized = normalizePromoCode(rawCode);
  const secret = readPromoSecret();
  return crypto.createHmac("sha256", secret).update(normalized).digest("hex");
}
