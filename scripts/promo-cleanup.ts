import { prisma } from "../lib/prisma";

async function main() {
  const now = new Date();

  const expiredCodes = await prisma.promoCode.updateMany({
    where: {
      isActive: true,
      expiresAt: { lte: now },
    },
    data: { isActive: false },
  });

  const expiredEntitlements = await prisma.userEntitlement.updateMany({
    where: {
      promoAccessActive: true,
      promoAccessEndAt: { lte: now },
    },
    data: { promoAccessActive: false },
  });

  const expiredRedemptions = await prisma.promoRedemption.updateMany({
    where: {
      grantEndAt: { lte: now },
      grantStatus: { not: "expired" },
    },
    data: { grantStatus: "expired" },
  });

  console.log("[promo-cleanup] completed", {
    now: now.toISOString(),
    deactivatedPromoCodes: expiredCodes.count,
    deactivatedPromoEntitlements: expiredEntitlements.count,
    markedExpiredRedemptions: expiredRedemptions.count,
  });
}

main()
  .catch((error) => {
    console.error("[promo-cleanup] failed", error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

