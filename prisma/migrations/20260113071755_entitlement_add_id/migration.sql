/*
  Warnings:

  - The primary key for the `UserEntitlement` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `giftUnlimited` on the `UserEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `stripeStatus` on the `UserEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSubId` on the `UserEntitlement` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `UserEntitlement` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `UserEntitlement` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/

-- 1) 先加 nullable
ALTER TABLE "UserEntitlement" ADD COLUMN "id" TEXT;

-- 2) 回填旧数据（用 gen_random_uuid 或 md5 都行）
-- 如果 Neon 支持 pgcrypto:
UPDATE "UserEntitlement"
SET "id" = gen_random_uuid()::text
WHERE "id" IS NULL;

-- 3) 再改为 not null
ALTER TABLE "UserEntitlement" ALTER COLUMN "id" SET NOT NULL;

-- 4) 设主键
ALTER TABLE "UserEntitlement" ADD CONSTRAINT "UserEntitlement_pkey" PRIMARY KEY ("id");

-- DropIndex
DROP INDEX "UserEntitlement_plan_idx";

-- DropIndex
DROP INDEX "UserEntitlement_stripeCustomerId_key";

-- DropIndex
DROP INDEX "UserEntitlement_stripeStatus_idx";

-- DropIndex
DROP INDEX "UserEntitlement_stripeSubId_key";

-- AlterTable
ALTER TABLE "UserEntitlement" DROP CONSTRAINT "UserEntitlement_pkey",
DROP COLUMN "giftUnlimited",
DROP COLUMN "stripeStatus",
DROP COLUMN "stripeSubId",
ADD COLUMN     "canSeeSuspiciousSentences" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chatPerDay" INTEGER,
ADD COLUMN     "detectorWordsPerWeek" INTEGER,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "noteSecondsPerWeek" INTEGER,
ADD COLUMN     "unlimited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usedChatCountToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usedDetectorWordsThisWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usedNoteSecondsThisWeek" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "UserEntitlement_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntitlement_userId_key" ON "UserEntitlement"("userId");
