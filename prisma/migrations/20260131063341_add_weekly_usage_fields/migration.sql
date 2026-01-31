-- AlterTable
ALTER TABLE "UserEntitlement" ADD COLUMN     "usedDetectorWordsThisWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usedNoteSecondsThisWeek" INTEGER NOT NULL DEFAULT 0;
