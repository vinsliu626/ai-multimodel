/*
  Warnings:

  - You are about to drop the column `usedChatCountToday` on the `UserEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `usedDetectorWordsThisWeek` on the `UserEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `usedNoteSecondsThisWeek` on the `UserEntitlement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserEntitlement" DROP COLUMN "usedChatCountToday",
DROP COLUMN "usedDetectorWordsThisWeek",
DROP COLUMN "usedNoteSecondsThisWeek";

-- CreateIndex
CREATE INDEX "ChatSession_userId_pinned_updatedAt_idx" ON "ChatSession"("userId", "pinned", "updatedAt");
