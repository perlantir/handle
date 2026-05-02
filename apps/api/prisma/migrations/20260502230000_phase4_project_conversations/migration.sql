-- Phase 4 redesign: move from task rows to project conversations and agent runs.
-- Existing task data was development audit data and is intentionally not migrated.

DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "Task" CASCADE;
DROP TYPE IF EXISTS "Role";
DROP TYPE IF EXISTS "TaskStatus";

CREATE TYPE "ScopeType" AS ENUM ('DEFAULT_WORKSPACE', 'CUSTOM_FOLDER', 'FULL_ACCESS');
CREATE TYPE "BackendType" AS ENUM ('E2B', 'LOCAL');
CREATE TYPE "BrowserMode" AS ENUM ('SEPARATE_PROFILE', 'ACTUAL_CHROME');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspaceScope" "ScopeType" NOT NULL DEFAULT 'DEFAULT_WORKSPACE',
    "customScopePath" TEXT,
    "defaultBackend" "BackendType" NOT NULL DEFAULT 'E2B',
    "defaultProvider" TEXT,
    "defaultModel" TEXT,
    "browserMode" "BrowserMode" NOT NULL DEFAULT 'SEPARATE_PROFILE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "goal" TEXT NOT NULL,
    "result" TEXT,
    "toolCalls" JSONB NOT NULL DEFAULT '[]',
    "costUsd" DECIMAL(10,4),
    "backend" "BackendType" NOT NULL DEFAULT 'E2B',
    "providerId" TEXT,
    "modelName" TEXT,
    "sandboxId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "agentRunId" TEXT,
    "providerId" TEXT,
    "modelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");
CREATE INDEX "Conversation_projectId_updatedAt_idx" ON "Conversation"("projectId", "updatedAt");
CREATE INDEX "AgentRun_conversationId_startedAt_idx" ON "AgentRun"("conversationId", "startedAt");
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_agentRunId_idx" ON "Message"("agentRunId");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_agentRunId_fkey"
  FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Project" (
  "id",
  "name",
  "workspaceScope",
  "defaultBackend",
  "browserMode",
  "updatedAt"
) VALUES (
  'default-project',
  'Personal',
  'DEFAULT_WORKSPACE',
  'E2B',
  'SEPARATE_PROFILE',
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
