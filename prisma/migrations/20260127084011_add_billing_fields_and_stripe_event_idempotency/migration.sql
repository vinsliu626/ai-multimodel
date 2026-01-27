/*
  Warnings:

  - You are about to drop the column `error` on the `AiNoteSession` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `AiNoteSession` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AiNoteSession` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AiNoteSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AiNoteSession" DROP COLUMN "error",
DROP COLUMN "result",
DROP COLUMN "status",
DROP COLUMN "updatedAt";
