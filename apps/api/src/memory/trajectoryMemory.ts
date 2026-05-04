import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";

export type TrajectoryOutcome =
  | "ABANDONED"
  | "CANCELLED"
  | "FAILED"
  | "RUNNING"
  | "SUCCEEDED";

export type TrajectoryStepStatus =
  | "cancelled"
  | "reasoning_error"
  | "success"
  | "tool_error";

export interface TrajectoryStepRecord {
  completedAt?: string;
  durationMs: number;
  errorReason?: string;
  startedAt?: string;
  status: TrajectoryStepStatus;
  subgoal: string;
  toolInput: unknown;
  toolName: string;
  toolOutput: unknown;
}

export interface StoredTrajectoryStep extends TrajectoryStepRecord {
  step: number;
}

export interface TrajectoryStore {
  agentRunTrajectory?: {
    findMany?(args: unknown): Promise<unknown[]>;
    findUnique?(args: unknown): Promise<unknown | null>;
    update?(args: unknown): Promise<unknown>;
    upsert?(args: unknown): Promise<unknown>;
  } | undefined;
  trajectoryTemplate?: {
    create?(args: unknown): Promise<unknown>;
    findMany?(args: unknown): Promise<unknown[]>;
    update?(args: unknown): Promise<unknown>;
  } | undefined;
  notificationDelivery?: {
    findMany?(args: unknown): Promise<unknown[]>;
  } | undefined;
}

export function goalEmbedding(goal: string) {
  return createHash("sha256").update(goal.toLowerCase().trim()).digest();
}

export async function initializeTrajectory({
  agentRunId,
  goal,
  store = prisma,
}: {
  agentRunId: string;
  goal: string;
  store?: TrajectoryStore;
}) {
  if (!store.agentRunTrajectory?.upsert) return;
  await store.agentRunTrajectory.upsert({
    create: {
      agentRunId,
      goal: redactSecrets(goal),
      goalEmbedding: goalEmbedding(goal),
      outcome: "RUNNING",
      outcomeMetrics: {},
      steps: [],
    },
    update: {
      goal: redactSecrets(goal),
      goalEmbedding: goalEmbedding(goal),
      outcome: "RUNNING",
    },
    where: { agentRunId },
  });
}

export async function recordTrajectoryStep({
  agentRunId,
  step,
  store = prisma,
}: {
  agentRunId: string;
  step: TrajectoryStepRecord;
  store?: TrajectoryStore;
}) {
  if (!store.agentRunTrajectory?.findUnique || !store.agentRunTrajectory.update) return;

  try {
    const existing = await store.agentRunTrajectory.findUnique({
      where: { agentRunId },
    }) as { steps?: unknown } | null;
    const steps = normalizeSteps(existing?.steps);
    const nextStep: StoredTrajectoryStep = {
      ...redactStep(step),
      step: steps.length + 1,
    };
    const nextSteps = [...steps, nextStep];
    await store.agentRunTrajectory.update({
      data: {
        outcomeMetrics: metricsForSteps(nextSteps),
        steps: nextSteps,
      },
      where: { agentRunId },
    });
  } catch (err) {
    logger.warn({ agentRunId, err }, "Failed to record trajectory step");
  }
}

export async function completeTrajectory({
  agentRunId,
  outcome,
  outcomeReason,
  store = prisma,
}: {
  agentRunId: string;
  outcome: Exclude<TrajectoryOutcome, "RUNNING">;
  outcomeReason?: string;
  store?: TrajectoryStore;
}) {
  if (!store.agentRunTrajectory?.findUnique || !store.agentRunTrajectory.update) return;

  try {
    const existing = await store.agentRunTrajectory.findUnique({
      where: { agentRunId },
    }) as { steps?: unknown } | null;
    const steps = normalizeSteps(existing?.steps);
    await store.agentRunTrajectory.update({
      data: {
        completedAt: new Date(),
        outcome,
        outcomeMetrics: metricsForSteps(steps),
        ...(outcomeReason ? { outcomeReason: redactSecrets(outcomeReason) } : {}),
      },
      where: { agentRunId },
    });
  } catch (err) {
    logger.warn({ agentRunId, err, outcome }, "Failed to complete trajectory");
  }
}

export function trajectoryOutcomeFromStatus(status: "CANCELLED" | "ERROR" | "STOPPED") {
  if (status === "STOPPED") return "SUCCEEDED" as const;
  if (status === "CANCELLED") return "CANCELLED" as const;
  return "FAILED" as const;
}

export function failureReasonFromError(err: unknown) {
  if (!err) return undefined;
  return redactSecrets(err instanceof Error ? err.message : String(err));
}

export function normalizeSteps(value: unknown): StoredTrajectoryStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredTrajectoryStep => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "toolName" in item &&
        typeof item.toolName === "string",
    );
  });
}

export function summarizeStepsForPrompt(steps: StoredTrajectoryStep[]) {
  return steps
    .slice(0, 8)
    .map((step) => `${step.step}. ${step.subgoal || `Used ${step.toolName}`} (${step.toolName})`)
    .join("\n");
}

function metricsForSteps(steps: StoredTrajectoryStep[]) {
  return {
    failedToolCalls: steps.filter((step) => step.status !== "success").length,
    totalDurationMs: steps.reduce((sum, step) => sum + (step.durationMs || 0), 0),
    totalToolCalls: steps.length,
  };
}

function redactStep(step: TrajectoryStepRecord): TrajectoryStepRecord {
  return {
    ...step,
    ...(step.errorReason ? { errorReason: redactSecrets(step.errorReason) } : {}),
    subgoal: redactSecrets(step.subgoal),
    toolInput: redactUnknown(step.toolInput),
    toolOutput: redactUnknown(step.toolOutput),
  };
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return truncate(redactSecrets(value));
  if (Array.isArray(value)) return value.map(redactUnknown).slice(0, 50);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [key, redactUnknown(item)]),
    );
  }
  return value;
}

function truncate(value: string) {
  return value.length > 2_000 ? `${value.slice(0, 2_000)}... [truncated]` : value;
}
