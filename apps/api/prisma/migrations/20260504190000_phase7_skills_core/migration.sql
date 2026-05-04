CREATE TYPE "SkillSourceType" AS ENUM ('BUILTIN', 'CUSTOM', 'IMPORTED');
CREATE TYPE "SkillVisibility" AS ENUM ('BUILTIN', 'PERSONAL', 'PROJECT');
CREATE TYPE "SkillRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "SkillRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'WORKFLOW', 'API', 'SUGGESTED');
CREATE TYPE "SkillRunStepType" AS ENUM ('PLAN', 'TOOL', 'APPROVAL', 'ARTIFACT', 'MEMORY', 'BROWSER', 'COMPUTER', 'CRITIC', 'WORKFLOW', 'SCHEDULE', 'ERROR');
CREATE TYPE "SkillArtifactKind" AS ENUM ('REPORT', 'SOURCE_SET', 'EMAIL_DRAFTS', 'ITINERARY', 'CODE_REVIEW', 'NOTION_SUMMARY', 'EXECUTION_PLAN', 'FILE', 'BROWSER_SESSION_SUMMARY', 'TRACE_SUMMARY', 'CUSTOM_JSON', 'CUSTOM_MARKDOWN');

CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceType" "SkillSourceType" NOT NULL,
    "visibility" "SkillVisibility" NOT NULL,
    "ownerUserId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" JSONB NOT NULL DEFAULT '{}',
    "packageMetadata" JSONB NOT NULL DEFAULT '{}',
    "packagePath" TEXT,
    "skillMd" TEXT NOT NULL,
    "activationExamples" JSONB NOT NULL DEFAULT '[]',
    "negativeActivationExamples" JSONB NOT NULL DEFAULT '[]',
    "inputSlots" JSONB NOT NULL DEFAULT '[]',
    "requiredIntegrations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalIntegrations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "runtimePolicy" JSONB NOT NULL DEFAULT '{}',
    "toolPolicy" JSONB NOT NULL DEFAULT '{}',
    "approvalPolicy" JSONB NOT NULL DEFAULT '{}',
    "outputArtifactContract" JSONB NOT NULL DEFAULT '{}',
    "sourceCitationPolicy" JSONB NOT NULL DEFAULT '{}',
    "uiTemplate" TEXT NOT NULL DEFAULT 'standard',
    "suggestedProvider" TEXT,
    "suggestedModel" TEXT,
    "evalFixtures" JSONB NOT NULL DEFAULT '[]',
    "reusableResources" JSONB NOT NULL DEFAULT '[]',
    "schedulingConfig" JSONB NOT NULL DEFAULT '{}',
    "customMetadata" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillRun" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "conversationId" TEXT,
    "agentRunId" TEXT,
    "temporalWorkflowId" TEXT,
    "temporalRunId" TEXT,
    "trigger" "SkillRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "SkillRunStatus" NOT NULL DEFAULT 'QUEUED',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "effectivePolicies" JSONB NOT NULL DEFAULT '{}',
    "providerId" TEXT,
    "modelName" TEXT,
    "resultSummary" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "costUsd" DECIMAL(10,4),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillRunStep" (
    "id" TEXT NOT NULL,
    "skillRunId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" "SkillRunStepType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "safeSummary" TEXT NOT NULL,
    "toolName" TEXT,
    "connectorId" TEXT,
    "approvalId" TEXT,
    "artifactId" TEXT,
    "redactedInput" JSONB NOT NULL DEFAULT '{}',
    "redactedOutput" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SkillRunStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillArtifact" (
    "id" TEXT NOT NULL,
    "skillRunId" TEXT NOT NULL,
    "kind" "SkillArtifactKind" NOT NULL,
    "title" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "inlineContent" TEXT,
    "contentRef" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Skill_slug_version_sourceType_ownerUserId_projectId_key" ON "Skill"("slug", "version", "sourceType", "ownerUserId", "projectId");
CREATE INDEX "Skill_visibility_projectId_idx" ON "Skill"("visibility", "projectId");
CREATE INDEX "Skill_ownerUserId_updatedAt_idx" ON "Skill"("ownerUserId", "updatedAt");
CREATE INDEX "SkillRun_skillId_createdAt_idx" ON "SkillRun"("skillId", "createdAt");
CREATE INDEX "SkillRun_userId_status_createdAt_idx" ON "SkillRun"("userId", "status", "createdAt");
CREATE INDEX "SkillRun_projectId_createdAt_idx" ON "SkillRun"("projectId", "createdAt");
CREATE INDEX "SkillRun_agentRunId_idx" ON "SkillRun"("agentRunId");
CREATE UNIQUE INDEX "SkillRunStep_skillRunId_index_key" ON "SkillRunStep"("skillRunId", "index");
CREATE INDEX "SkillRunStep_skillRunId_type_idx" ON "SkillRunStep"("skillRunId", "type");
CREATE INDEX "SkillArtifact_skillRunId_kind_idx" ON "SkillArtifact"("skillRunId", "kind");

ALTER TABLE "SkillRun" ADD CONSTRAINT "SkillRun_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillRunStep" ADD CONSTRAINT "SkillRunStep_skillRunId_fkey" FOREIGN KEY ("skillRunId") REFERENCES "SkillRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillArtifact" ADD CONSTRAINT "SkillArtifact_skillRunId_fkey" FOREIGN KEY ("skillRunId") REFERENCES "SkillRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
