-- Phase 5 trajectory, checkpoint, and shared-memory foundations.

ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

CREATE TYPE "TrajectoryOutcome" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'CANCELLED');

CREATE TABLE "AgentRunTrajectory" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "outcome" "TrajectoryOutcome" NOT NULL DEFAULT 'RUNNING',
    "outcomeReason" TEXT,
    "outcomeMetrics" JSONB NOT NULL DEFAULT '{}',
    "goal" TEXT NOT NULL DEFAULT '',
    "goalEmbedding" BYTEA,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRunTrajectory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrajectoryTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" JSONB NOT NULL,
    "goalEmbedding" BYTEA NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdFromIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrajectoryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRunCheckpoint" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "sandboxRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedMemoryNamespace" (
    "id" TEXT NOT NULL,
    "parentRunId" TEXT NOT NULL,
    "entries" JSONB NOT NULL DEFAULT '{}',
    "lockedKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedMemoryNamespace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRunTrajectory_agentRunId_key" ON "AgentRunTrajectory"("agentRunId");
CREATE INDEX "AgentRunTrajectory_outcome_createdAt_idx" ON "AgentRunTrajectory"("outcome", "createdAt");
CREATE INDEX "AgentRunTrajectory_templateId_idx" ON "AgentRunTrajectory"("templateId");
CREATE INDEX "TrajectoryTemplate_updatedAt_idx" ON "TrajectoryTemplate"("updatedAt");
CREATE INDEX "AgentRunCheckpoint_agentRunId_stepIndex_idx" ON "AgentRunCheckpoint"("agentRunId", "stepIndex");
CREATE INDEX "SharedMemoryNamespace_parentRunId_idx" ON "SharedMemoryNamespace"("parentRunId");

ALTER TABLE "AgentRunTrajectory" ADD CONSTRAINT "AgentRunTrajectory_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunTrajectory" ADD CONSTRAINT "AgentRunTrajectory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TrajectoryTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRunCheckpoint" ADD CONSTRAINT "AgentRunCheckpoint_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedMemoryNamespace" ADD CONSTRAINT "SharedMemoryNamespace_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
