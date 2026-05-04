-- Phase 6.5 Stage 5: workflow templates.

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "triggerConnectorId" TEXT NOT NULL,
    "triggerEventType" TEXT NOT NULL,
    "triggerFilter" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "eventPayload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "actionLogId" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_userId_enabled_idx" ON "Workflow"("userId", "enabled");
CREATE INDEX "Workflow_triggerConnectorId_triggerEventType_idx" ON "Workflow"("triggerConnectorId", "triggerEventType");
CREATE INDEX "WorkflowRun_workflowId_triggeredAt_idx" ON "WorkflowRun"("workflowId", "triggeredAt");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

ALTER TABLE "WorkflowRun"
ADD CONSTRAINT "WorkflowRun_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
