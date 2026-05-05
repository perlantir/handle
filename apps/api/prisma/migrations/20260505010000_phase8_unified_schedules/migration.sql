-- Phase 8: unified schedules platform.

ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_RUN_COMPLETED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_RUN_FAILED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_RUN_SKIPPED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CHANGE_DETECTED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_APPROVAL_NEEDED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_INTEGRATION_WAIT';

ALTER TABLE "NotificationSettings"
ALTER COLUMN "eventTypes" SET DEFAULT '["TASK_COMPLETED","TASK_FAILED","APPROVAL_NEEDED","CRITIC_FLAGGED","SCHEDULE_RUN_COMPLETED","SCHEDULE_RUN_FAILED","SCHEDULE_RUN_SKIPPED","SCHEDULE_APPROVAL_NEEDED","SCHEDULE_INTEGRATION_WAIT"]'::jsonb;

CREATE TYPE "ScheduleTargetType" AS ENUM ('TASK', 'SKILL', 'SKILL_WORKFLOW', 'WIDE_RESEARCH');
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INTEGRATION', 'ERROR');
CREATE TYPE "ScheduleRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INTEGRATION', 'COMPLETED', 'COMPLETED_WITH_LIMIT', 'FAILED', 'CANCELLED', 'SKIPPED', 'TEST_PASSED');
CREATE TYPE "ScheduleOverlapPolicy" AS ENUM ('SKIP', 'BUFFER_ONE', 'BUFFER_ALL', 'CANCEL_OTHER', 'TERMINATE_OTHER', 'ALLOW_ALL');
CREATE TYPE "ScheduleCatchupPolicy" AS ENUM ('SKIP_MISSED', 'RUN_LATEST', 'RUN_ALL_WITH_LIMIT');

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetType" "ScheduleTargetType" NOT NULL,
    "targetRef" JSONB NOT NULL DEFAULT '{}',
    "input" JSONB NOT NULL DEFAULT '{}',
    "naturalLanguage" TEXT,
    "cronExpression" TEXT,
    "runAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PAUSED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "temporalScheduleId" TEXT,
    "overlapPolicy" "ScheduleOverlapPolicy" NOT NULL DEFAULT 'SKIP',
    "catchupPolicy" "ScheduleCatchupPolicy" NOT NULL DEFAULT 'SKIP_MISSED',
    "approvalPolicy" JSONB NOT NULL DEFAULT '{}',
    "quotaPolicy" JSONB NOT NULL DEFAULT '{}',
    "notificationPolicy" JSONB NOT NULL DEFAULT '{}',
    "changeDetectionPolicy" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "legacySkillScheduleId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleRun" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "ScheduleRunStatus" NOT NULL DEFAULT 'QUEUED',
    "runMode" TEXT NOT NULL DEFAULT 'normal',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "temporalWorkflowId" TEXT,
    "agentRunId" TEXT,
    "skillRunId" TEXT,
    "skillWorkflowRunId" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "outputSummary" TEXT,
    "artifacts" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "trace" JSONB NOT NULL DEFAULT '[]',
    "healthChecks" JSONB NOT NULL DEFAULT '[]',
    "approvalState" JSONB NOT NULL DEFAULT '{}',
    "quotaSnapshot" JSONB NOT NULL DEFAULT '{}',
    "costUsd" DECIMAL(10,4),
    "changeDetected" BOOLEAN NOT NULL DEFAULT false,
    "changeSummary" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" "ScheduleTargetType" NOT NULL,
    "targetRef" JSONB NOT NULL DEFAULT '{}',
    "inputDefaults" JSONB NOT NULL DEFAULT '{}',
    "scheduleDefaults" JSONB NOT NULL DEFAULT '{}',
    "policyDefaults" JSONB NOT NULL DEFAULT '{}',
    "requiredConnectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Schedule_legacySkillScheduleId_key" ON "Schedule"("legacySkillScheduleId");
CREATE INDEX "Schedule_userId_status_createdAt_idx" ON "Schedule"("userId", "status", "createdAt");
CREATE INDEX "Schedule_targetType_createdAt_idx" ON "Schedule"("targetType", "createdAt");
CREATE INDEX "Schedule_projectId_createdAt_idx" ON "Schedule"("projectId", "createdAt");
CREATE INDEX "Schedule_enabled_idx" ON "Schedule"("enabled");
CREATE INDEX "ScheduleRun_scheduleId_createdAt_idx" ON "ScheduleRun"("scheduleId", "createdAt");
CREATE INDEX "ScheduleRun_userId_status_createdAt_idx" ON "ScheduleRun"("userId", "status", "createdAt");
CREATE INDEX "ScheduleRun_agentRunId_idx" ON "ScheduleRun"("agentRunId");
CREATE INDEX "ScheduleRun_skillRunId_idx" ON "ScheduleRun"("skillRunId");
CREATE UNIQUE INDEX "ScheduleTemplate_slug_key" ON "ScheduleTemplate"("slug");
CREATE INDEX "ScheduleTemplate_category_enabled_idx" ON "ScheduleTemplate"("category", "enabled");

ALTER TABLE "ScheduleRun" ADD CONSTRAINT "ScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Schedule" (
    "id",
    "userId",
    "projectId",
    "name",
    "targetType",
    "targetRef",
    "input",
    "cronExpression",
    "runAt",
    "timezone",
    "status",
    "enabled",
    "temporalScheduleId",
    "legacySkillScheduleId",
    "lastRunAt",
    "nextRunAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'schedule_' || "id",
    "userId",
    "projectId",
    "name",
    'SKILL'::"ScheduleTargetType",
    jsonb_build_object('skillId', "skillId"),
    "inputs",
    "cronExpression",
    "runAt",
    "timezone",
    CASE WHEN "enabled" THEN 'ACTIVE'::"ScheduleStatus" ELSE 'PAUSED'::"ScheduleStatus" END,
    "enabled",
    "temporalScheduleId",
    "id",
    "lastRunAt",
    "nextRunAt",
    "createdAt",
    "updatedAt"
FROM "SkillSchedule"
ON CONFLICT ("legacySkillScheduleId") DO NOTHING;
