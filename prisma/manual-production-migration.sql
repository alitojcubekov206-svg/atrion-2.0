-- Run this once in Neon SQL Editor before deploying the new application code.
-- Existing accounts stay verified; all newly registered accounts must enter an email code.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'emailVerified'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN;
    UPDATE "User" SET "emailVerified" = TRUE;
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT FALSE;
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET NOT NULL;
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "verificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "threeDGenerations" INTEGER NOT NULL DEFAULT 0;
