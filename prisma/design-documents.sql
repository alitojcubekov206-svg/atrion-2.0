-- Добавочная DDL для ревью/staging. На production в этой задаче не выполняется.
-- Существующая схема управляется через db push; это не история Prisma migrations.
CREATE TABLE IF NOT EXISTS "DesignDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DesignDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DesignDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DesignDocument_userId_kind_updatedAt_idx" ON "DesignDocument"("userId", "kind", "updatedAt");
