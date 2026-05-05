CREATE TYPE "AgentExecutionMode" AS ENUM (
  'AUTO',
  'RESEARCHER',
  'CODER',
  'DESIGNER',
  'OPERATOR',
  'WRITER',
  'MULTI_AGENT_TEAM'
);

CREATE TYPE "AgentSpecialistRole" AS ENUM (
  'SUPERVISOR',
  'RESEARCHER',
  'CODER',
  'DESIGNER',
  'OPERATOR',
  'WRITER',
  'ANALYST',
  'VERIFIER',
  'SYNTHESIZER'
);

CREATE TYPE "AgentSubRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'REVISED',
  'REJECTED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "AgentHandoffStatus" AS ENUM (
  'REQUESTED',
  'ACCEPTED',
  'COMPLETED',
  'REJECTED'
);

CREATE TYPE "CriticInterventionScope" AS ENUM (
  'ALL_DECISIONS',
  'WRITES_ONLY',
  'RISKY_ONLY'
);

CREATE TYPE "CriticVerdict" AS ENUM (
  'APPROVE',
  'REVISE',
  'REJECT'
);

CREATE TYPE "VoiceProviderId" AS ENUM (
  'DEEPGRAM',
  'OPENAI',
  'ELEVENLABS'
);

CREATE TYPE "VoiceCommandDecision" AS ENUM (
  'EXECUTED',
  'REJECTED',
  'NEEDS_CONFIRMATION'
);

CREATE TYPE "VoiceCommandType" AS ENUM (
  'SUBMIT_TASK',
  'PAUSE_RUN',
  'RESUME_RUN',
  'CANCEL_RUN',
  'STATUS_QUERY',
  'APPROVE_ACTION',
  'DENY_ACTION',
  'READ_ALOUD',
  'UNKNOWN'
);

CREATE TYPE "VoiceRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

ALTER TABLE "Project"
  ADD COLUMN "agentExecutionMode" "AgentExecutionMode" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "criticEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "criticScope" "CriticInterventionScope" NOT NULL DEFAULT 'RISKY_ONLY',
  ADD COLUMN "criticModelProvider" TEXT,
  ADD COLUMN "criticModelName" TEXT,
  ADD COLUMN "maxRuntimeSeconds" INTEGER NOT NULL DEFAULT 1800,
  ADD COLUMN "maxCostCents" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "maxToolCalls" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "maxSupervisorTurns" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "maxSpecialistSubRuns" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "maxParallelSubRuns" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "maxRevisionLoops" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "AgentSubRun" (
  "id" TEXT NOT NULL,
  "agentRunId" TEXT NOT NULL,
  "parentSubRunId" TEXT,
  "role" "AgentSpecialistRole" NOT NULL,
  "label" TEXT NOT NULL,
  "status" "AgentSubRunStatus" NOT NULL DEFAULT 'QUEUED',
  "goal" TEXT NOT NULL,
  "safeSummary" TEXT NOT NULL DEFAULT '',
  "inputs" JSONB NOT NULL DEFAULT '{}',
  "outputs" JSONB NOT NULL DEFAULT '{}',
  "trace" JSONB NOT NULL DEFAULT '[]',
  "costUsd" DECIMAL(10,4),
  "toolCallCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentSubRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentHandoff" (
  "id" TEXT NOT NULL,
  "agentRunId" TEXT NOT NULL,
  "fromRole" "AgentSpecialistRole" NOT NULL,
  "toRole" "AgentSpecialistRole" NOT NULL,
  "fromSubRunId" TEXT,
  "toSubRunId" TEXT,
  "status" "AgentHandoffStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "artifactRefs" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AgentHandoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "voiceInputEnabled" BOOLEAN NOT NULL DEFAULT false,
  "voiceOutputEnabled" BOOLEAN NOT NULL DEFAULT false,
  "readAloudEnabled" BOOLEAN NOT NULL DEFAULT false,
  "verbalApprovalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "storeTranscripts" BOOLEAN NOT NULL DEFAULT false,
  "storeRawAudio" BOOLEAN NOT NULL DEFAULT false,
  "requireConfirmationForVoiceCommands" BOOLEAN NOT NULL DEFAULT true,
  "requireConfirmationForHighRiskApproval" BOOLEAN NOT NULL DEFAULT true,
  "preferredSpeechToTextProvider" "VoiceProviderId" NOT NULL DEFAULT 'DEEPGRAM',
  "preferredTextToSpeechProvider" "VoiceProviderId" NOT NULL DEFAULT 'ELEVENLABS',
  "openAiVoice" TEXT NOT NULL DEFAULT 'coral',
  "elevenLabsVoiceId" TEXT NOT NULL DEFAULT 'JBFqnCBsd6RMkjVDRZzb',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceCommand" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "agentRunId" TEXT,
  "commandType" "VoiceCommandType" NOT NULL,
  "parsedJson" JSONB NOT NULL DEFAULT '{}',
  "decision" "VoiceCommandDecision" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "riskLevel" "VoiceRiskLevel" NOT NULL,
  "transcript" TEXT,
  "transcriptStored" BOOLEAN NOT NULL DEFAULT false,
  "approvalId" TEXT,
  "confirmationCode" TEXT,
  "rejectionReason" TEXT,
  "providerId" "VoiceProviderId",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentSubRun_agentRunId_role_idx" ON "AgentSubRun"("agentRunId", "role");
CREATE INDEX "AgentSubRun_status_createdAt_idx" ON "AgentSubRun"("status", "createdAt");
CREATE INDEX "AgentHandoff_agentRunId_createdAt_idx" ON "AgentHandoff"("agentRunId", "createdAt");
CREATE INDEX "AgentHandoff_fromRole_toRole_idx" ON "AgentHandoff"("fromRole", "toRole");
CREATE INDEX "VoiceCommand_userId_createdAt_idx" ON "VoiceCommand"("userId", "createdAt");
CREATE INDEX "VoiceCommand_agentRunId_createdAt_idx" ON "VoiceCommand"("agentRunId", "createdAt");
CREATE INDEX "VoiceCommand_decision_createdAt_idx" ON "VoiceCommand"("decision", "createdAt");

ALTER TABLE "AgentSubRun" ADD CONSTRAINT "AgentSubRun_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSubRun" ADD CONSTRAINT "AgentSubRun_parentSubRunId_fkey" FOREIGN KEY ("parentSubRunId") REFERENCES "AgentSubRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCommand" ADD CONSTRAINT "VoiceCommand_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
