-- Additive schema change for an existing Atrion PostgreSQL database.
-- Review and back up the target database before execution. No users are modified.
BEGIN;
CREATE TABLE "design_projects" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "roomType" TEXT NOT NULL, "style" TEXT NOT NULL,
  "prompt" TEXT NOT NULL DEFAULT '', "scene" JSONB NOT NULL, "plan" JSONB, "revision" INTEGER NOT NULL DEFAULT 0,
  "currentVersionId" TEXT, "redoIds" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "design_projects_userId_updatedAt_idx" ON "design_projects"("userId", "updatedAt");
CREATE TABLE "design_versions" (
  "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "parentId" TEXT,
  "source" TEXT NOT NULL, "actionType" TEXT NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "design_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "design_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "design_versions_projectId_createdAt_idx" ON "design_versions"("projectId", "createdAt");
CREATE TABLE "design_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued', "progress" INTEGER NOT NULL DEFAULT 0, "stage" TEXT NOT NULL DEFAULT 'queued',
  "input" JSONB NOT NULL, "result" JSONB, "error" TEXT, "baseRevision" INTEGER NOT NULL,
  "quotaDay" TIMESTAMP(3) NOT NULL, "freeCharge" INTEGER NOT NULL DEFAULT 0, "refunded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "design_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "design_jobs_status_createdAt_idx" ON "design_jobs"("status", "createdAt");
CREATE INDEX "design_jobs_projectId_idx" ON "design_jobs"("projectId");
COMMIT;
