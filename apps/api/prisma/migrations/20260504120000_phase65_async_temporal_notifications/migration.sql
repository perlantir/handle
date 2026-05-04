-- AlterEnum
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'QUEUED';

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('TASK_COMPLETED', 'TASK_FAILED', 'APPROVAL_NEEDED', 'CRITIC_FLAGGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SLACK', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "AgentRun"
  ADD COLUMN "asyncMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "lastNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "workflowId" TEXT,
  ADD COLUMN "workflowRunId" TEXT,
  ADD COLUMN "workflowStatus" TEXT;

-- CreateTable
CREATE TABLE "TemporalSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "address" TEXT NOT NULL DEFAULT '127.0.0.1:7233',
  "namespace" TEXT NOT NULL DEFAULT 'default',
  "taskQueue" TEXT NOT NULL DEFAULT 'handle-agent-runs',
  "lastHealthStatus" TEXT NOT NULL DEFAULT 'unknown',
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemporalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "emailRecipient" TEXT,
  "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
  "slackChannelId" TEXT,
  "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
  "webhookUrl" TEXT,
  "eventTypes" JSONB NOT NULL DEFAULT '["TASK_COMPLETED","TASK_FAILED","APPROVAL_NEEDED","CRITIC_FLAGGED"]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNotificationSettings" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "inheritGlobal" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN,
  "emailRecipient" TEXT,
  "slackEnabled" BOOLEAN,
  "slackChannelId" TEXT,
  "webhookEnabled" BOOLEAN,
  "webhookUrl" TEXT,
  "eventTypes" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "agentRunId" TEXT,
  "eventType" "NotificationEventType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_workflowId_key" ON "AgentRun"("workflowId");

-- CreateIndex
CREATE INDEX "AgentRun_workflowRunId_idx" ON "AgentRun"("workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNotificationSettings_projectId_key" ON "ProjectNotificationSettings"("projectId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_agentRunId_idx" ON "NotificationDelivery"("agentRunId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- AddForeignKey
ALTER TABLE "ProjectNotificationSettings" ADD CONSTRAINT "ProjectNotificationSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
