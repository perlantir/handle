import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";
import { appendMemoryLog } from "./memoryLog";
import {
  goalEmbedding,
  normalizeSteps,
  summarizeStepsForPrompt,
  type StoredTrajectoryStep,
  type TrajectoryStore,
} from "./trajectoryMemory";

export interface ProceduralTrajectoryMatch {
  agentRunId: string;
  goal: string;
  outcome: "FAILED" | "SUCCEEDED";
  outcomeReason?: string | null;
  similarity: number;
  steps: StoredTrajectoryStep[];
}

export interface ProcedureTemplateSummary {
  id: string;
  name: string;
  pattern: unknown;
  successRate: number;
  usageCount: number;
  createdFromIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FailurePatternSummary {
  agentRunId: string;
  goal: string;
  outcomeReason?: string | null;
  similarity?: number;
  steps: StoredTrajectoryStep[];
  createdAt?: string;
}

interface RawTrajectory {
  agentRunId?: string;
  createdAt?: Date | string;
  goal?: string;
  outcome?: string;
  outcomeReason?: string | null;
  steps?: unknown;
}

const PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES = Math.max(
  2,
  Number.parseInt(process.env.HANDLE_PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES ?? "2", 10) || 2,
);

export async function findSimilarSuccessfulTrajectories({
  goal,
  limit = 3,
  projectId,
  store = prisma,
}: {
  goal: string;
  limit?: number;
  projectId?: string | null;
  store?: TrajectoryStore;
}) {
  return findSimilarTrajectories({
    goal,
    limit,
    outcome: "SUCCEEDED",
    ...(projectId === undefined ? {} : { projectId }),
    store,
  });
}

export async function findSimilarFailedTrajectories({
  goal,
  limit = 2,
  projectId,
  store = prisma,
}: {
  goal: string;
  limit?: number;
  projectId?: string | null;
  store?: TrajectoryStore;
}) {
  return findSimilarTrajectories({
    goal,
    limit,
    outcome: "FAILED",
    ...(projectId === undefined ? {} : { projectId }),
    store,
  });
}

export async function findSimilarTrajectories({
  goal,
  limit,
  outcome,
  projectId,
  store = prisma,
}: {
  goal: string;
  limit: number;
  outcome: "FAILED" | "SUCCEEDED";
  projectId?: string | null;
  store?: TrajectoryStore;
}): Promise<ProceduralTrajectoryMatch[]> {
  if (!store.agentRunTrajectory?.findMany) return [];
  const rows = await store.agentRunTrajectory.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    where: {
      outcome,
      ...(projectId
        ? { agentRun: { conversation: { projectId } } }
        : {}),
    },
  }) as RawTrajectory[];

  return rows
    .map((row) => {
      const rowGoal = redactSecrets(row.goal ?? "");
      return {
        agentRunId: String(row.agentRunId ?? ""),
        goal: rowGoal,
        outcome,
        outcomeReason: row.outcomeReason ?? null,
        similarity: similarity(goal, rowGoal),
        steps: normalizeSteps(row.steps),
      };
    })
    .filter((item) => item.agentRunId && item.similarity > 0.05 && item.steps.length > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function formatProceduralMemoryContext(matches: ProceduralTrajectoryMatch[]) {
  if (matches.length === 0) return "";
  return [
    "<procedural_memory>",
    "You have completed similar tasks before. Here are example approaches that succeeded:",
    "",
    ...matches.flatMap((match, index) => [
      `Example ${index + 1} (similarity ${Math.round(match.similarity * 100)}%):`,
      `  Goal: "${match.goal}"`,
      "  Approach:",
      indent(summarizeStepsForPrompt(match.steps), 4),
      "  Outcome: succeeded",
      "",
    ]),
    "Use these as inspiration but adapt to the current task's specifics. Don't blindly copy steps that don't apply.",
    "</procedural_memory>",
  ].join("\n");
}

export function formatFailureMemoryContext(matches: ProceduralTrajectoryMatch[]) {
  if (matches.length === 0) return "";
  return [
    "<failure_memory>",
    "Past attempts at similar tasks have failed. Avoid these patterns:",
    "",
    ...matches.flatMap((match, index) => [
      `Failure ${index + 1} (similarity ${Math.round(match.similarity * 100)}%):`,
      `  Goal: "${match.goal}"`,
      "  Approach:",
      indent(summarizeStepsForPrompt(match.steps), 4),
      `  Outcome: FAILED${match.outcomeReason ? ` - ${match.outcomeReason}` : ""}`,
      "  Lesson: choose a different path if the current plan would repeat this failure.",
      "",
    ]),
    "Failure memory shows past dead-ends. Treat them as cautionary, not prohibitive. If this task genuinely requires a similar approach, explicitly justify why this case differs.",
    "</failure_memory>",
  ].join("\n");
}

export async function synthesizeTrajectoryTemplates({
  projectId,
  store = prisma,
}: {
  projectId?: string | null;
  store?: TrajectoryStore;
} = {}) {
  if (!store.agentRunTrajectory?.findMany || !store.trajectoryTemplate?.create) {
    await logSynthesisDecision({
      decision: "unsupported_store",
      projectId: projectId ?? null,
      threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
    });
    return { created: 0, skipped: 0, threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES, updated: 0 };
  }
  const trajectories = await store.agentRunTrajectory.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    where: {
      outcome: "SUCCEEDED",
      ...(projectId ? { agentRun: { conversation: { projectId } } } : {}),
    },
  }) as RawTrajectory[];

  const groups = new Map<string, RawTrajectory[]>();
  for (const trajectory of trajectories) {
    const key = templateKey(trajectory.goal ?? "");
    if (!key) {
      await logSynthesisDecision({
        decision: "skipped_no_key",
        projectId: projectId ?? null,
        threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
      });
      continue;
    }
    const current = groups.get(key) ?? [];
    current.push(trajectory);
    groups.set(key, current);
  }

  let created = 0;
  let skipped = 0;
  let updated = 0;
  for (const [key, rows] of groups) {
    if (rows.length < PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES) {
      skipped += 1;
      await logSynthesisDecision({
        candidateCount: rows.length,
        decision: "below_threshold",
        key,
        projectId: projectId ?? null,
        threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
      });
      continue;
    }
    const exemplar = rows[0];
    const pattern = rows
      .flatMap((row) => normalizeSteps(row.steps).slice(0, 5))
      .map((step) => ({ subgoal: step.subgoal, toolName: step.toolName }));
    const data = {
      createdFromIds: rows.map((row) => String(row.agentRunId ?? "")).filter(Boolean),
      goalEmbedding: goalEmbedding(key),
      name: `Procedure: ${key}`,
      pattern,
      successRate: 1,
      usageCount: rows.length,
    };
    const existing = await findExistingTemplateByName(store, data.name);
    if (existing?.id && store.trajectoryTemplate.update) {
      await store.trajectoryTemplate.update({
        data,
        where: { id: existing.id },
      });
      updated += 1;
      await logSynthesisDecision({
        candidateCount: rows.length,
        decision: "updated",
        key,
        projectId: projectId ?? null,
        templateId: existing.id,
        threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
      });
    } else {
      await store.trajectoryTemplate.create({ data });
      if (exemplar) created += 1;
      await logSynthesisDecision({
        candidateCount: rows.length,
        decision: "created",
        key,
        projectId: projectId ?? null,
        threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
      });
    }
  }

  logger.info(
    {
      created,
      groupCount: groups.size,
      projectId: projectId ?? null,
      skipped,
      threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES,
      updated,
    },
    "Procedural template synthesis completed",
  );

  return { created, skipped, threshold: PROCEDURAL_TEMPLATE_MIN_TRAJECTORIES, updated };
}

export async function listProcedureTemplates({
  store = prisma,
}: {
  store?: TrajectoryStore;
} = {}): Promise<ProcedureTemplateSummary[]> {
  if (!store.trajectoryTemplate?.findMany) return [];
  const rows = await store.trajectoryTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  }) as Array<{
    createdAt?: Date | string;
    createdFromIds?: string[];
    id?: string;
    name?: string;
    pattern?: unknown;
    successRate?: number;
    updatedAt?: Date | string;
    usageCount?: number;
  }>;
  return rows.map((row) => ({
    ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
    createdFromIds: row.createdFromIds ?? [],
    id: String(row.id ?? ""),
    name: String(row.name ?? "Procedure"),
    pattern: row.pattern ?? [],
    successRate: row.successRate ?? 0,
    ...(row.updatedAt ? { updatedAt: new Date(row.updatedAt).toISOString() } : {}),
    usageCount: row.usageCount ?? 0,
  }));
}

export async function listFailurePatterns({
  store = prisma,
}: {
  store?: TrajectoryStore;
} = {}): Promise<FailurePatternSummary[]> {
  const rows = store.agentRunTrajectory?.findMany
    ? (await store.agentRunTrajectory.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        where: { outcome: "FAILED" },
      }) as RawTrajectory[])
    : [];

  const trajectoryFailures = rows.map((row) => ({
    ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
    agentRunId: String(row.agentRunId ?? ""),
    goal: redactSecrets(row.goal ?? "Failed task"),
    outcomeReason: row.outcomeReason ?? null,
    steps: normalizeSteps(row.steps),
  }));

  const notificationFailures = store.notificationDelivery?.findMany
    ? (await store.notificationDelivery.findMany({
        orderBy: { updatedAt: "desc" },
        take: 50,
        where: { status: "FAILED" },
      }) as Array<{
        agentRunId?: string | null;
        channel?: string;
        createdAt?: Date | string;
        errorCode?: string | null;
        errorMessage?: string | null;
        id?: string;
        updatedAt?: Date | string;
      }>)
    : [];

  return [
    ...trajectoryFailures,
    ...notificationFailures.map((row) => ({
      createdAt: new Date(row.updatedAt ?? row.createdAt ?? new Date()).toISOString(),
      agentRunId: row.agentRunId ?? `notification:${row.id ?? "unknown"}`,
      goal: `Notification delivery failed (${row.channel ?? "unknown"})`,
      outcomeReason: redactSecrets(row.errorMessage ?? row.errorCode ?? "Notification dispatch failed"),
      steps: [
        {
          durationMs: 0,
          errorReason: redactSecrets(row.errorMessage ?? "Notification dispatch failed"),
          status: "tool_error" as const,
          step: 1,
          subgoal: `Deliver ${String(row.channel ?? "notification").toLowerCase()} notification`,
          toolInput: { channel: row.channel },
          toolName: "notification.send",
          toolOutput: { errorCode: row.errorCode },
        },
      ],
    })),
  ];
}

function similarity(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function indent(value: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .filter(Boolean)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function templateKey(goal: string) {
  const all = [...tokens(goal)].filter((token) => !["that", "with", "from"].includes(token));
  return all.slice(0, 3).join(" ");
}

async function findExistingTemplateByName(store: TrajectoryStore, name: string) {
  if (!store.trajectoryTemplate?.findMany) return null;
  try {
    const rows = (await store.trajectoryTemplate.findMany({
      take: 1,
      where: { name },
    })) as Array<{ id?: string }>;
    return rows[0]?.id ? { id: String(rows[0].id) } : null;
  } catch (err) {
    logger.warn({ err, name }, "Failed to look up existing trajectory template");
    return null;
  }
}

async function logSynthesisDecision({
  candidateCount,
  decision,
  key,
  projectId,
  templateId,
  threshold,
}: {
  candidateCount?: number;
  decision: string;
  key?: string;
  projectId?: string | null;
  templateId?: string;
  threshold: number;
}) {
  await appendMemoryLog({
    details: {
      ...(candidateCount === undefined ? {} : { candidateCount }),
      decision,
      ...(key ? { key } : {}),
      ...(templateId ? { templateId } : {}),
      threshold,
    },
    durationMs: 0,
    operation: "procedural.synthesis",
    provider: "self-hosted",
    ...(projectId ? { projectId } : {}),
    status: "ok",
  }).catch((err) => {
    logger.warn(
      { decision, err, projectId: projectId ?? null },
      "Failed to write procedural synthesis log",
    );
  });
}
