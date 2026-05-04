import { emitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { createAgentRunCheckpoint, type AgentRunCheckpointStore } from "./runCheckpoint";
import { pauseActiveAgentRun } from "./runControl";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const DEFAULT_REASON = "Paused by user";

export interface AgentRunPauseStore extends AgentRunCheckpointStore {
  agentRun?: {
    findFirst(args: unknown): Promise<{ id: string; goal?: string; status?: string } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

export async function pauseAgentRunById({
  reason = DEFAULT_REASON,
  runId,
  store,
}: {
  reason?: string;
  runId: string;
  store: AgentRunPauseStore;
}) {
  if (!store.agentRun) {
    throw new Error("AgentRun store is not configured");
  }

  const run = await store.agentRun.findFirst({
    select: { goal: true, id: true, status: true },
    where: { id: runId },
  });
  if (!run) return { active: false, found: false, paused: false };

  if (run.status === "PAUSED") {
    return { active: false, found: true, paused: true, status: "PAUSED" };
  }

  if (run.status && TERMINAL_STATUSES.has(run.status)) {
    return { active: false, found: true, paused: false, status: run.status };
  }

  const active = await pauseActiveAgentRun(runId, reason);
  await createAgentRunCheckpoint({ reason, runId, store });
  await store.agentRun.update({
    data: {
      result: reason,
      status: "PAUSED",
    },
    where: { id: runId },
  });

  emitTaskEvent({
    type: "status_update",
    detail: reason,
    status: "PAUSED",
    taskId: runId,
  });
  logger.info({ active: active.active, runId }, "Agent run paused");

  return {
    active: active.active,
    found: true,
    paused: true,
    status: "PAUSED",
  };
}
