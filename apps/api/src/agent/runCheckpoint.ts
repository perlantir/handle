import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";
import { normalizeSteps, type StoredTrajectoryStep } from "../memory/trajectoryMemory";

export interface AgentRunCheckpointStore {
  agentRun?: {
    findFirst?(args: unknown): Promise<unknown | null>;
  } | undefined;
  agentRunCheckpoint?: {
    create?(args: unknown): Promise<unknown>;
    findFirst?(args: unknown): Promise<unknown | null>;
  } | undefined;
  agentRunTrajectory?: {
    findUnique?(args: unknown): Promise<unknown | null>;
  } | undefined;
}

interface CheckpointState {
  goal?: string;
  reason?: string;
  status?: string;
  stepCount: number;
  lastSteps: StoredTrajectoryStep[];
}

export async function createAgentRunCheckpoint({
  reason,
  runId,
  store,
}: {
  reason?: string;
  runId: string;
  store: AgentRunCheckpointStore;
}) {
  if (!store.agentRunCheckpoint?.create) return null;

  try {
    const [run, trajectory] = await Promise.all([
      store.agentRun?.findFirst
        ? store.agentRun.findFirst({
            select: { goal: true, status: true },
            where: { id: runId },
          })
        : Promise.resolve(null),
      store.agentRunTrajectory?.findUnique
        ? store.agentRunTrajectory.findUnique({
            select: { steps: true },
            where: { agentRunId: runId },
          })
        : Promise.resolve(null),
    ]);
    const steps = normalizeSteps((trajectory as { steps?: unknown } | null)?.steps);
    const state: CheckpointState = {
      goal: redactSecrets(String((run as { goal?: string } | null)?.goal ?? "")),
      lastSteps: steps.slice(-5),
      ...(reason ? { reason: redactSecrets(reason) } : {}),
      status: String((run as { status?: string } | null)?.status ?? "RUNNING"),
      stepCount: steps.length,
    };

    return store.agentRunCheckpoint.create({
      data: {
        agentRunId: runId,
        stepIndex: steps.length,
        state,
      },
    });
  } catch (err) {
    logger.warn({ err, runId }, "Failed to create agent run checkpoint");
    return null;
  }
}

export async function latestCheckpointContext({
  runId,
  store,
}: {
  runId: string;
  store: AgentRunCheckpointStore;
}) {
  if (!store.agentRunCheckpoint?.findFirst) return "";

  const checkpoint = await store.agentRunCheckpoint.findFirst({
    orderBy: { stepIndex: "desc" },
    where: { agentRunId: runId },
  }) as { state?: unknown; stepIndex?: number } | null;
  if (!checkpoint) return "";

  const state = checkpoint.state as Partial<CheckpointState> | undefined;
  const stepCount = Number(state?.stepCount ?? checkpoint.stepIndex ?? 0);
  const lastSteps = normalizeSteps(state?.lastSteps);
  return [
    "<resume_checkpoint>",
    `This run was resumed from checkpoint step ${stepCount}.`,
    "Completed work before pause:",
    lastSteps.length > 0
      ? lastSteps.map((step) => `  ${step.step}. ${step.subgoal || `Used ${step.toolName}`}`).join("\n")
      : "  No completed tool steps were recorded before pause.",
    "Continue from this point. Do not repeat completed work unless verification requires it.",
    "</resume_checkpoint>",
  ].join("\n");
}
