/*
  Fix migration: avoid multiple primary keys on UserEntitlement
  Goal:
  - Add id as primary key (backfill existing rows)
  - Ensure userId stays UNIQUE
  - Remove giftUnlimited (schema no longer has it)
  - Keep stripeSubId / stripeStatus (do NOT drop them)
  - Add missing columns used by current schema (safe with IF NOT EXISTS)
*/

-- 0) Ensure UUID function exists (Neon/Postgres usually allows this)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add "id" column as nullable first (safe on non-empty tables)
ALTER TABLE "UserEntitlement"
  ADD COLUMN IF NOT EXISTS "id" TEXT;

-- 2) Backfill id for existing rows
-- Prefer gen_random_uuid(); if extension is blocked in your env,
-- replace with: md5(random()::text || clock_timestamp()::text)
UPDATE "UserEntitlement"
SET "id" = gen_random_uuid()::text
WHERE "id" IS NULL;

-- 3) Make id NOT NULL
ALTER TABLE "UserEntitlement"
  ALTER COLUMN "id" SET NOT NULL;

-- 4) Drop existing primary key FIRST (avoid multiple primary keys)
ALTER TABLE "UserEntitlement"
  DROP CONSTRAINT IF EXISTS "UserEntitlement_pkey";

-- 5) Add new primary key on id
ALTER TABLE "UserEntitlement"
  ADD CONSTRAINT "UserEntitlement_pkey" PRIMARY KEY ("id");

-- 6) Drop columns that no longer exist in schema (only giftUnlimited)
ALTER TABLE "UserEntitlement"
  DROP COLUMN IF EXISTS "giftUnlimited";

-- 7) Ensure columns used by current schema exist
ALTER TABLE "UserEntitlement"
  ADD COLUMN IF NOT EXISTS "canSeeSuspiciousSentences" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "chatPerDay" INTEGER,
  ADD COLUMN IF NOT EXISTS "detectorWordsPerWeek" INTEGER,
  ADD COLUMN IF NOT EXISTS "noteSecondsPerWeek" INTEGER,
  ADD COLUMN IF NOT EXISTS "unlimited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "usedChatCountToday" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "usedDetectorWordsThisWeek" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "usedNoteSecondsThisWeek" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stripeSubId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeStatus" TEXT;

-- 8) Keep userId unique (required by your Prisma schema)
CREATE UNIQUE INDEX IF NOT EXISTS "UserEntitlement_userId_key"
ON "UserEntitlement"("userId");

-- 9) Drop obsolete indexes if they exist (won't fail in shadow db)
DROP INDEX IF EXISTS "UserEntitlement_plan_idx";
DROP INDEX IF EXISTS "UserEntitlement_stripeCustomerId_key";
DROP INDEX IF EXISTS "UserEntitlement_stripeStatus_idx";
DROP INDEX IF EXISTS "UserEntitlement_stripeSubId_key";
