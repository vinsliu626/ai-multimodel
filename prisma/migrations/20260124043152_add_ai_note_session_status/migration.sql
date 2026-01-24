/*
  Warnings:

  - Added the required column `updatedAt` to the `AiNoteSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiNoteSession" ADD COLUMN     "error" TEXT,
ADD COLUMN     "result" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- 1) 先把列加出来（带默认值），避免旧数据报错
ALTER TABLE "AiNoteSession"
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "result" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 2) 回填旧数据的 updatedAt（用 createdAt 或 now）
UPDATE "AiNoteSession"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

-- 3) 再把 updatedAt 变成 NOT NULL（现在不会失败了）
ALTER TABLE "AiNoteSession"
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- （可选）如果你想要默认值，防止未来手动 insert 不写 updatedAt
ALTER TABLE "AiNoteSession"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();
