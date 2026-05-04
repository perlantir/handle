import { emitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { isProviderId, type ProviderId } from "../providers/types";

export interface AgentRunResumeStore {
  agentRun?: {
    findFirst(args: unknown): Promise<{
      backend?: string | null;
      goal?: string;
      id: string;
      providerId?: string | null;
      status?: string | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

export async function resumeAgentRunById({
  runAgent,
  runId,
  store,
}: {
  runAgent: (
    runId: string,
    goal: string,
    options?: { backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  runId: string;
  store: AgentRunResumeStore;
}) {
  if (!store.agentRun) throw new Error("AgentRun store is not configured");

  const run = await store.agentRun.findFirst({
    select: { backend: true, goal: true, id: true, providerId: true, status: true },
    where: { id: runId },
  });
  if (!run) return { found: false, resumed: false };
  if (run.status !== "PAUSED") {
    return { found: true, resumed: false, status: run.status ?? "UNKNOWN" };
  }

  await store.agentRun.update({
    data: { completedAt: null, result: null, status: "RUNNING" },
    where: { id: runId },
  });

  emitTaskEvent({
    detail: "Resumed by user",
    status: "RUNNING",
    taskId: runId,
    type: "status_update",
  });

  const providerOverride = isProviderId(run.providerId ?? "")
    ? (run.providerId as ProviderId)
    : undefined;
  runAgent(runId, run.goal ?? "", {
    backend: run.backend === "LOCAL" || run.backend === "local" ? "local" : "e2b",
    ...(providerOverride ? { providerOverride } : {}),
  }).catch((err) => {
    logger.error({ err, runId }, "runAgent resume unhandled rejection");
  });

  return { found: true, resumed: true, status: "RUNNING" };
}
