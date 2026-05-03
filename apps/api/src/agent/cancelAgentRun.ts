import type { AgentRunCancelledEvent } from "@handle/shared";
import { emitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { cancelActiveAgentRun } from "./runControl";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const DEFAULT_REASON = "Cancelled by user";

export interface AgentRunCancelStore {
  agentRun?: {
    findFirst(args: unknown): Promise<{ id: string; status?: string } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

export async function cancelAgentRunById({
  reason = DEFAULT_REASON,
  runId,
  store,
}: {
  reason?: string;
  runId: string;
  store: AgentRunCancelStore;
}) {
  if (!store.agentRun) {
    throw new Error("AgentRun store is not configured");
  }

  const run = await store.agentRun.findFirst({
    select: { id: true, status: true },
    where: { id: runId },
  });
  if (!run) return { active: false, cancelled: false, found: false };

  if (run.status && TERMINAL_STATUSES.has(run.status)) {
    return {
      active: false,
      cancelled: run.status === "CANCELLED",
      found: true,
      status: run.status,
    };
  }

  const active = await cancelActiveAgentRun(runId, reason);
  await store.agentRun.update({
    data: {
      completedAt: new Date(),
      result: reason,
      status: "CANCELLED",
    },
    where: { id: runId },
  });

  const event: AgentRunCancelledEvent = {
    type: "agent_run_cancelled",
    reason,
    taskId: runId,
  };
  emitTaskEvent(event);
  emitTaskEvent({
    type: "status_update",
    detail: reason,
    status: "CANCELLED",
    taskId: runId,
  });
  logger.info({ active: active.active, runId }, "Agent run cancelled");

  return {
    active: active.active,
    cancelled: true,
    found: true,
    status: "CANCELLED",
  };
}
