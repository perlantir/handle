CREATE TABLE "SafetySettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "trustedDomains" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetySettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SafetySettings" ("id", "trustedDomains", "updatedAt")
VALUES ('global', '[]', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
