-- DropForeignKey
ALTER TABLE "AiNoteJob" DROP CONSTRAINT "AiNoteJob_noteId_fkey";

-- DropIndex
DROP INDEX "AiNoteJob_userId_updatedAt_idx";

-- AlterTable
ALTER TABLE "AiNoteSession" ADD COLUMN     "aiNoteJobId" TEXT;

-- AddForeignKey
ALTER TABLE "AiNoteSession" ADD CONSTRAINT "AiNoteSession_aiNoteJobId_fkey" FOREIGN KEY ("aiNoteJobId") REFERENCES "AiNoteJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
