import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";
const require = createRequire(import.meta.url);
const { getGiftCampaignPolicy } = require("../lib/billing/giftCampaigns") as typeof import("../lib/billing/giftCampaigns");

function loadEnvFile(fileName: string) {
  const fullPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) return;
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

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

async function hasTable(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";
  const now = args.now ? new Date(args.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid --now timestamp");

  const hasGiftCodeTable = await hasTable("GiftCode");
  const hasGiftRedemptionTable = await hasTable("GiftCodeRedemption");
  const hasPromoCodeTable = await hasTable("PromoCode");

  if (!hasGiftCodeTable) {
    console.log("[gift-cleanup] skipped", {
      reason: "GiftCode table not found",
      promoCodeTablePresent: hasPromoCodeTable,
    });
    return;
  }

  const giftCodes = await prisma.giftCode.findMany({
    select: {
      code: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const expiredCodes = giftCodes
    .map((giftCode) => {
      const policy = getGiftCampaignPolicy(giftCode.code);
      if (!policy) return null;
      if (policy.codeExpiresAt.getTime() > now.getTime()) return null;
      return {
        code: giftCode.code,
        expiresAt: policy.codeExpiresAt.toISOString(),
      };
    })
    .filter((value): value is { code: string; expiresAt: string } => value !== null);

  const unknownExpiryCodes = giftCodes.filter((giftCode) => !getGiftCampaignPolicy(giftCode.code)).map((giftCode) => giftCode.code);

  if (expiredCodes.length === 0) {
    console.log("[gift-cleanup] completed", {
      mode: dryRun ? "dry-run" : "delete",
      now: now.toISOString(),
      expiredCodesFound: 0,
      deletedGiftCodes: 0,
      deletedGiftRedemptions: 0,
      preservedUnknownExpiryCodes: unknownExpiryCodes.length,
      promoCodeTablePresent: hasPromoCodeTable,
      redemptionHistoryPreserved: true,
    });
    return;
  }

  const expiredCodeValues = expiredCodes.map((entry) => entry.code);
  const redemptionsScheduledForDeletion = hasGiftRedemptionTable
    ? await prisma.giftCodeRedemption.count({
        where: { code: { in: expiredCodeValues } },
      })
    : 0;

  if (dryRun) {
    console.log("[gift-cleanup] completed", {
      mode: "dry-run",
      now: now.toISOString(),
      expiredCodesFound: expiredCodes.length,
      deletedGiftCodes: 0,
      deletedGiftRedemptions: 0,
      preservedUnknownExpiryCodes: unknownExpiryCodes.length,
      promoCodeTablePresent: hasPromoCodeTable,
      redemptionHistoryPreserved: true,
      expiredCodes,
      redemptionsScheduledForDeletion,
    });
    return;
  }

  const result = await prisma.$transaction(async (tx: any) => {
    const deletedGiftRedemptions = hasGiftRedemptionTable
      ? await tx.giftCodeRedemption.deleteMany({
          where: { code: { in: expiredCodeValues } },
        })
      : { count: 0 };

    const deletedGiftCodes = await tx.giftCode.deleteMany({
      where: { code: { in: expiredCodeValues } },
    });

    return {
      deletedGiftRedemptions: deletedGiftRedemptions.count,
      deletedGiftCodes: deletedGiftCodes.count,
    };
  });

  console.log("[gift-cleanup] completed", {
    mode: "delete",
    now: now.toISOString(),
    expiredCodesFound: expiredCodes.length,
    deletedGiftCodes: result.deletedGiftCodes,
    deletedGiftRedemptions: result.deletedGiftRedemptions,
    preservedUnknownExpiryCodes: unknownExpiryCodes.length,
    promoCodeTablePresent: hasPromoCodeTable,
    redemptionHistoryPreserved: false,
    expiredCodes,
  });
}

main()
  .catch((error) => {
    console.error("[gift-cleanup] failed", error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
