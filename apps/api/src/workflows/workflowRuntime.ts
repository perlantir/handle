import { appendActionLog } from "../lib/actionLog";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";

export interface WorkflowAction {
  connectorId: string;
  params: Record<string, unknown>;
  toolName: string;
}

export interface WorkflowRow {
  actions: unknown;
  id: string;
  name: string;
  triggerConnectorId: string;
  triggerEventType: string;
  userId: string;
}

export interface WorkflowRuntimeStore {
  workflowRun: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
}

export function normalizeWorkflowActions(value: unknown): WorkflowAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      connectorId: typeof item.connectorId === "string" ? item.connectorId : "unknown",
      params: typeof item.params === "object" && item.params !== null ? item.params as Record<string, unknown> : {},
      toolName: typeof item.toolName === "string" ? item.toolName : "unknown.execute",
    }));
}

export async function runWorkflow({
  eventPayload = {},
  store = prisma,
  workflow,
}: {
  eventPayload?: Record<string, unknown>;
  store?: WorkflowRuntimeStore;
  workflow: WorkflowRow;
}) {
  const run = await store.workflowRun.create({
    data: {
      eventPayload: redactUnknown(eventPayload),
      status: "RUNNING",
      workflowId: workflow.id,
    },
  });

  try {
    const actions = normalizeWorkflowActions(workflow.actions);
    for (const action of actions) {
      await appendActionLog({
        conversationId: `workflow:${workflow.id}`,
        description: `Workflow ${workflow.name} prepared ${action.toolName}`,
        metadata: {
          action: redactUnknown(action),
          eventPayload: redactUnknown(eventPayload),
          triggerConnectorId: workflow.triggerConnectorId,
          triggerEventType: workflow.triggerEventType,
        },
        outcomeType: "integration_action",
        projectId: "workflow",
        reversible: false,
        target: `${action.connectorId}:${action.toolName}`,
        taskId: run.id,
        timestamp: new Date().toISOString(),
      });
    }

    await store.workflowRun.update({
      data: {
        completedAt: new Date(),
        status: "COMPLETED",
      },
      where: { id: run.id },
    });
    return { runId: run.id, status: "COMPLETED" as const };
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    await store.workflowRun.update({
      data: {
        completedAt: new Date(),
        error: message,
        status: "FAILED",
      },
      where: { id: run.id },
    });
    return { error: message, runId: run.id, status: "FAILED" as const };
  }
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]),
    );
  }
  return value;
}
