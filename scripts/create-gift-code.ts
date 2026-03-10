export {};

// scripts/create-gift-codes.ts
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const nodeCrypto = require("crypto") as typeof import("crypto");

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

const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

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

function genCode(prefix = "GIFT", len = 16) {
  const raw = nodeCrypto.randomBytes(32).toString("hex").toUpperCase();
  return `${prefix}_${raw.slice(0, len)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = Number.parseInt(args.count ?? "20", 10);
  const maxUses = args.maxUses === "null" ? null : Number.parseInt(args.maxUses ?? "1", 10);
  const isActive = args.isActive ? args.isActive !== "false" : true;

  if (args.code) {
    const code = args.code.trim().toUpperCase();
    if (!code) throw new Error("Invalid --code value");

    const saved = await prisma.giftCode.upsert({
      where: { code },
      update: { isActive, maxUses, usedCount: 0 },
      create: { code, isActive, maxUses, usedCount: 0 },
    });

    console.log("Gift code saved:");
    console.log(`  code: ${saved.code}`);
    console.log(`  isActive: ${saved.isActive}`);
    console.log(`  maxUses: ${saved.maxUses ?? "unlimited"}`);
    return;
  }

  const codes = Array.from({ length: count }).map(() => ({
    code: genCode("GIFT", 20),
    isActive,
    maxUses,
    usedCount: 0,
  }));

  await prisma.giftCode.createMany({ data: codes, skipDuplicates: true });

  console.log("Created codes:");
  codes.forEach((code) => console.log(code.code));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
