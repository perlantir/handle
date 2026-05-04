CREATE TYPE "IntegrationConnectorId" AS ENUM (
  'GMAIL',
  'SLACK',
  'NOTION',
  'GOOGLE_DRIVE',
  'GITHUB',
  'GOOGLE_CALENDAR',
  'CLOUDFLARE',
  'VERCEL',
  'LINEAR',
  'GOOGLE_SHEETS',
  'GOOGLE_DOCS',
  'ZAPIER',
  'OBSIDIAN'
);

CREATE TYPE "IntegrationConnectionStatus" AS ENUM (
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'EXPIRED',
  'REVOKED',
  'RATE_LIMITED',
  'ERROR'
);

CREATE TABLE "NangoSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "configured" BOOLEAN NOT NULL DEFAULT false,
  "host" TEXT NOT NULL DEFAULT 'https://api.nango.dev',
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "secretKeyRef" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NangoSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationConnectorSettings" (
  "id" TEXT NOT NULL,
  "connectorId" "IntegrationConnectorId" NOT NULL,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "nangoIntegrationId" TEXT,
  "nangoProviderId" TEXT,
  "oauthClientId" TEXT,
  "oauthClientSecretRef" TEXT,
  "redirectUri" TEXT,
  "requiredScopes" JSONB NOT NULL DEFAULT '[]',
  "setupStatus" TEXT NOT NULL DEFAULT 'missing_credentials',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationConnectorSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Integration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectorId" "IntegrationConnectorId" NOT NULL,
  "nangoIntegrationId" TEXT,
  "nangoConnectionId" TEXT,
  "accountAlias" TEXT NOT NULL,
  "accountLabel" TEXT,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "defaultAccount" BOOLEAN NOT NULL DEFAULT false,
  "memoryScope" "MemoryScope" NOT NULL DEFAULT 'NONE',
  "lastUsedAt" TIMESTAMP(3),
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnectorSettings_connectorId_key" ON "IntegrationConnectorSettings"("connectorId");
CREATE INDEX "Integration_userId_connectorId_idx" ON "Integration"("userId", "connectorId");
CREATE INDEX "Integration_userId_status_idx" ON "Integration"("userId", "status");
CREATE UNIQUE INDEX "Integration_userId_connectorId_accountAlias_key" ON "Integration"("userId", "connectorId", "accountAlias");
