/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `UserEntitlement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubId]` on the table `UserEntitlement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserEntitlement" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeStatus" TEXT,
ADD COLUMN     "stripeSubId" TEXT;

-- CreateIndex
CREATE INDEX "GiftCode_isActive_idx" ON "GiftCode"("isActive");

-- CreateIndex
CREATE INDEX "GiftCodeRedemption_code_createdAt_idx" ON "GiftCodeRedemption"("code", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntitlement_stripeCustomerId_key" ON "UserEntitlement"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntitlement_stripeSubId_key" ON "UserEntitlement"("stripeSubId");

-- CreateIndex
CREATE INDEX "UserEntitlement_plan_idx" ON "UserEntitlement"("plan");

-- CreateIndex
CREATE INDEX "UserEntitlement_stripeStatus_idx" ON "UserEntitlement"("stripeStatus");
