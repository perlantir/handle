-- Phase 6.5 Stage 2: BYOK web search providers.

CREATE TYPE "SearchProviderId" AS ENUM ('TAVILY', 'SERPER', 'BRAVE');

CREATE TABLE "SearchProviderConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" "SearchProviderId" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keychainAlias" TEXT,
    "rateLimitPerMinute" INTEGER,
    "memoryScope" "MemoryScope" NOT NULL DEFAULT 'NONE',
    "lastTestedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectSearchSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "defaultProvider" "SearchProviderId",
    "fallbackOrder" JSONB NOT NULL DEFAULT '["TAVILY","SERPER","BRAVE","BUILT_IN"]',
    "memoryScope" "MemoryScope" NOT NULL DEFAULT 'NONE',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSearchSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchProviderConfig_userId_providerId_key" ON "SearchProviderConfig"("userId", "providerId");
CREATE INDEX "SearchProviderConfig_userId_enabled_idx" ON "SearchProviderConfig"("userId", "enabled");
CREATE UNIQUE INDEX "ProjectSearchSettings_projectId_key" ON "ProjectSearchSettings"("projectId");

ALTER TABLE "ProjectSearchSettings"
ADD CONSTRAINT "ProjectSearchSettings_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
