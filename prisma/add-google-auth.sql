-- Additive OAuth identity storage. Does not alter existing User rows or password sessions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS "public"."auth_identities" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_provider_subject_key" ON "public"."auth_identities"("provider", "subject");
CREATE INDEX IF NOT EXISTS "auth_identities_userId_idx" ON "public"."auth_identities"("userId");
COMMIT;
