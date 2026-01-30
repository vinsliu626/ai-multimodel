-- AlterTable
ALTER TABLE "UserEntitlement" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "dailyUsageKey" TEXT,
ADD COLUMN     "unlimitedSource" TEXT,
ADD COLUMN     "weeklyUsageKey" TEXT;

-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedStripeEvent_eventId_key" ON "ProcessedStripeEvent"("eventId");

-- CreateIndex
CREATE INDEX "ProcessedStripeEvent_createdAt_idx" ON "ProcessedStripeEvent"("createdAt");
