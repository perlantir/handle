CREATE TABLE "ExecutionSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultBackend" TEXT NOT NULL DEFAULT 'e2b',
    "cleanupPolicy" TEXT NOT NULL DEFAULT 'keep-all',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ExecutionSettings" ("id", "defaultBackend", "cleanupPolicy", "updatedAt")
VALUES ('global', 'e2b', 'keep-all', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
