-- Phase 6.5 Stage 6: cross-integration saved agents.

CREATE TABLE "SavedAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "connectorAccess" TEXT[],
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "schedule" TEXT,
    "outputTarget" JSONB NOT NULL DEFAULT '{"type":"chat"}',
    "memoryScope" "MemoryScope" NOT NULL DEFAULT 'NONE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedAgentRun" (
    "id" TEXT NOT NULL,
    "savedAgentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "taskRunId" TEXT,
    "error" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SavedAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedAgent_userId_enabled_idx" ON "SavedAgent"("userId", "enabled");
CREATE INDEX "SavedAgent_trigger_idx" ON "SavedAgent"("trigger");
CREATE INDEX "SavedAgentRun_savedAgentId_ranAt_idx" ON "SavedAgentRun"("savedAgentId", "ranAt");
CREATE INDEX "SavedAgentRun_taskRunId_idx" ON "SavedAgentRun"("taskRunId");

ALTER TABLE "SavedAgentRun"
ADD CONSTRAINT "SavedAgentRun_savedAgentId_fkey"
FOREIGN KEY ("savedAgentId") REFERENCES "SavedAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
