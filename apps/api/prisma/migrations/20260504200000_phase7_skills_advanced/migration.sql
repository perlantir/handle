-- Phase 7 Stage 2: custom Skills, Skill workflows, schedules, and import records.

CREATE TABLE "SkillSchedule" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT,
    "runAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "temporalScheduleId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillWorkflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "SkillVisibility" NOT NULL DEFAULT 'PERSONAL',
    "graph" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillWorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "SkillRunStatus" NOT NULL DEFAULT 'QUEUED',
    "temporalWorkflowId" TEXT,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "artifactMap" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SkillWorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillImportRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "sourceName" TEXT NOT NULL,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillImportRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillSchedule_userId_enabled_idx" ON "SkillSchedule"("userId", "enabled");
CREATE INDEX "SkillSchedule_skillId_idx" ON "SkillSchedule"("skillId");
CREATE INDEX "SkillWorkflow_userId_projectId_idx" ON "SkillWorkflow"("userId", "projectId");
CREATE INDEX "SkillWorkflowRun_workflowId_createdAt_idx" ON "SkillWorkflowRun"("workflowId", "createdAt");
CREATE INDEX "SkillWorkflowRun_userId_status_idx" ON "SkillWorkflowRun"("userId", "status");
CREATE INDEX "SkillImportRecord_userId_createdAt_idx" ON "SkillImportRecord"("userId", "createdAt");

ALTER TABLE "SkillSchedule" ADD CONSTRAINT "SkillSchedule_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillWorkflowRun" ADD CONSTRAINT "SkillWorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SkillWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillImportRecord" ADD CONSTRAINT "SkillImportRecord_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
