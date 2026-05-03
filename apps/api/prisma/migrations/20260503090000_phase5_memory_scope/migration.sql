CREATE TYPE "MemoryScope" AS ENUM ('GLOBAL_AND_PROJECT', 'PROJECT_ONLY', 'NONE');

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "memoryScope" "MemoryScope" NOT NULL DEFAULT 'GLOBAL_AND_PROJECT';

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "memoryEnabled" BOOLEAN;

CREATE TABLE IF NOT EXISTS "MemorySettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "provider" TEXT NOT NULL DEFAULT 'self-hosted',
  "defaultScopeForNewProjects" "MemoryScope" NOT NULL DEFAULT 'GLOBAL_AND_PROJECT',
  "cloudBaseURL" TEXT,
  "selfHostedBaseURL" TEXT NOT NULL DEFAULT 'http://127.0.0.1:8000',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemorySettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MemorySettings" (
  "id",
  "provider",
  "defaultScopeForNewProjects",
  "selfHostedBaseURL",
  "updatedAt"
) VALUES (
  'global',
  'self-hosted',
  'GLOBAL_AND_PROJECT',
  'http://127.0.0.1:8000',
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
