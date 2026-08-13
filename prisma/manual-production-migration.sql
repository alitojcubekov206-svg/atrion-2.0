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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'planExpiresAt'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "planExpiresAt" TIMESTAMP(3);
    UPDATE "User"
      SET "planExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 days'
      WHERE "plan" = 'pro';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'finik',
  "providerPaymentId" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KGS',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "paymentUrl" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerPaymentId_key"
  ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerTransactionId_key"
  ON "Payment"("providerTransactionId");
CREATE INDEX IF NOT EXISTS "Payment_userId_status_idx"
  ON "Payment"("userId", "status");
