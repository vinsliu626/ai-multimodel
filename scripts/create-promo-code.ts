import crypto from "crypto";
import { PromoCodeType, PromoTargetPlan } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPromoCode, normalizePromoCode } from "../lib/promo/codeHash";

type ArgMap = Record<string, string>;

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const idx = raw.indexOf("=");
    if (idx < 0) {
      out[raw.slice(2)] = "true";
      continue;
    }
    out[raw.slice(2, idx)] = raw.slice(idx + 1);
  }
  return out;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d;
}

function parseIntArg(value: string | undefined, label: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid integer for ${label}: ${value}`);
  return n;
}

function randomCode(prefix: string): string {
  const token = crypto.randomBytes(9).toString("base64url").toUpperCase();
  return `${prefix}-${token}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const rawCode = args.code ? normalizePromoCode(args.code) : randomCode(args.prefix ?? "PROMO");
  const codeHash = hashPromoCode(rawCode);
  const codeType = (args.codeType?.toUpperCase() ?? "LIMITED") as PromoCodeType;
  const targetPlan = (args.targetPlan?.toUpperCase() ?? "PRO") as PromoTargetPlan;

  if (!Object.values(PromoCodeType).includes(codeType)) {
    throw new Error(`Invalid codeType: ${args.codeType}`);
  }
  if (!Object.values(PromoTargetPlan).includes(targetPlan)) {
    throw new Error(`Invalid targetPlan: ${args.targetPlan}`);
  }

  const startsAt = parseDate(args.startsAt);
  const expiresAt = parseDate(args.expiresAt);
  const grantFixedEndsAt = parseDate(args.grantFixedEndsAt);
  const grantDurationDays = parseIntArg(args.grantDurationDays, "grantDurationDays");
  const maxRedemptions = parseIntArg(args.maxRedemptions, "maxRedemptions");
  const perUserLimit = parseIntArg(args.perUserLimit, "perUserLimit") ?? 1;
  const isActive = args.isActive ? args.isActive !== "false" : true;

  if (grantDurationDays === null && !grantFixedEndsAt) {
    throw new Error("Set either --grantDurationDays=<days> or --grantFixedEndsAt=<ISO date>");
  }
  if (grantDurationDays !== null && grantDurationDays < 1) {
    throw new Error("grantDurationDays must be >= 1");
  }
  if (perUserLimit < 1) throw new Error("perUserLimit must be >= 1");
  if (startsAt && expiresAt && startsAt.getTime() >= expiresAt.getTime()) {
    throw new Error("startsAt must be before expiresAt");
  }

  const created = await prisma.promoCode.create({
    data: {
      codeHash,
      codeType,
      targetPlan,
      startsAt: startsAt ?? undefined,
      expiresAt: expiresAt ?? undefined,
      grantDurationDays: grantDurationDays ?? undefined,
      grantFixedEndsAt: grantFixedEndsAt ?? undefined,
      maxRedemptions: maxRedemptions ?? undefined,
      perUserLimit,
      isActive,
      notes: args.notes,
      createdBy: args.createdBy,
    },
  });

  console.log("Promo code created:");
  console.log(`  id: ${created.id}`);
  console.log(`  code: ${rawCode}`);
  console.log(`  type: ${created.codeType}`);
  console.log(`  targetPlan: ${created.targetPlan}`);
  console.log(`  startsAt: ${created.startsAt?.toISOString() ?? "none"}`);
  console.log(`  expiresAt: ${created.expiresAt?.toISOString() ?? "none"}`);
  console.log(`  grantDurationDays: ${created.grantDurationDays ?? "none"}`);
  console.log(`  grantFixedEndsAt: ${created.grantFixedEndsAt?.toISOString() ?? "none"}`);
  console.log(`  maxRedemptions: ${created.maxRedemptions ?? "unlimited"}`);
  console.log(`  perUserLimit: ${created.perUserLimit}`);
  console.log("Store the raw code securely; only the hash is stored in DB.");
}

main()
  .catch((error) => {
    console.error("Failed to create promo code:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
