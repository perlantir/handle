-- Phase 6.5 Stage 4: project-scoped critic/verifier role.

ALTER TABLE "Project"
ADD COLUMN "criticEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "criticModel" TEXT,
ADD COLUMN "criticScope" TEXT NOT NULL DEFAULT 'risky-only',
ADD COLUMN "criticMaxRevisions" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "CriticReview" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "projectId" TEXT,
    "interventionPoint" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriticReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CriticReview_agentRunId_createdAt_idx" ON "CriticReview"("agentRunId", "createdAt");
CREATE INDEX "CriticReview_projectId_createdAt_idx" ON "CriticReview"("projectId", "createdAt");

ALTER TABLE "CriticReview"
ADD CONSTRAINT "CriticReview_agentRunId_fkey"
FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CriticReview"
ADD CONSTRAINT "CriticReview_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
