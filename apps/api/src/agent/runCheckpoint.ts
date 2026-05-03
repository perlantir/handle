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
  const hasIncompleteStep = lastSteps.some((step) => step.status !== "success");
  return [
    "<resumption>",
    `This run was paused and resumed from checkpoint step ${stepCount}.`,
    state?.goal ? `Original goal: ${redactSecrets(state.goal)}` : null,
    hasIncompleteStep
      ? "The checkpoint includes at least one incomplete or failed tool step. Treat the original task as incomplete until you verify the actual output."
      : "The checkpoint may only contain partial evidence. Treat the original task as incomplete until you verify the actual output against the original goal.",
    "Rules for this resumed run:",
    "- Do not declare completion based on prior conversation or checkpoint text alone.",
    "- Check the actual output/artifacts against the original goal.",
    "- Partial output is not completion.",
    "- If prior output is partial, continue from the first missing step instead of claiming the work already finished.",
    "- If a previous shell command stopped early, rerun or continue it so the requested full output is produced.",
    "Checkpoint evidence before pause:",
    lastSteps.length > 0
      ? lastSteps.map(formatCheckpointStep).join("\n")
      : "  No completed tool steps were recorded before pause.",
    "</resumption>",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatCheckpointStep(step: StoredTrajectoryStep) {
  const output = summarizeToolOutput(step.toolOutput);
  return [
    `  ${step.step}. ${step.subgoal || `Used ${step.toolName}`} (${step.toolName}, status=${step.status})`,
    step.errorReason ? `     error: ${redactSecrets(step.errorReason)}` : null,
    output ? `     output: ${output}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function summarizeToolOutput(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return redactSecrets(text.trim().replace(/\s+/g, " ")).slice(0, 500);
}
