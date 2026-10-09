-- Add after add-interior.sql, only on an explicitly selected database.
BEGIN;
CREATE TABLE "forma_projects" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "document" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "archived" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "forma_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "forma_projects_userId_updatedAt_idx" ON "forma_projects"("userId","updatedAt");
CREATE TABLE "forma_files" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "objectKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "forma_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "forma_files_objectKey_key" ON "forma_files"("objectKey");
CREATE INDEX "forma_files_userId_idx" ON "forma_files"("userId");
COMMIT;
