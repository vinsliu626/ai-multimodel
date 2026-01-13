// scripts/create-gift-codes.ts
import { prisma } from "../lib/prisma";
import crypto from "crypto";

function genCode(prefix = "GIFT", len = 16) {
  const raw = crypto.randomBytes(32).toString("hex").toUpperCase();
  return `${prefix}_${raw.slice(0, len)}`;
}

async function main() {
  const count = 20;         // 生成多少个
  const maxUses = 1;        // 每个码可用次数，null = 无限次

  const codes = Array.from({ length: count }).map(() => ({
    code: genCode("GIFT", 20),
    isActive: true,
    maxUses,
    usedCount: 0,
  }));

  await prisma.giftCode.createMany({ data: codes, skipDuplicates: true });

  console.log("Created codes:");
  codes.forEach(c => console.log(c.code));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
