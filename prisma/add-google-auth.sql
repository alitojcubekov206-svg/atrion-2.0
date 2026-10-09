-- Additive OAuth identity storage. Does not alter existing User rows or password sessions.
BEGIN;
CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_provider_subject_key" ON "auth_identities"("provider", "subject");
CREATE INDEX IF NOT EXISTS "auth_identities_userId_idx" ON "auth_identities"("userId");
COMMIT;
