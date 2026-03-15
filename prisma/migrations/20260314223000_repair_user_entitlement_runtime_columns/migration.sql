ALTER TABLE "UserEntitlement"
  ADD COLUMN IF NOT EXISTS "developerBypass" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "developerBypassSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "developerBypassNote" TEXT,
  ADD COLUMN IF NOT EXISTS "promoPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "promoAccessStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoAccessEndAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoAccessActive" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "UserEntitlement_developerBypass_idx"
ON "UserEntitlement"("developerBypass");

CREATE INDEX IF NOT EXISTS "UserEntitlement_promoAccessActive_promoAccessEndAt_idx"
ON "UserEntitlement"("promoAccessActive", "promoAccessEndAt");
