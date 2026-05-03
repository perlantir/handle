import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
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
    return { created: 0 };
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
    if (!key) continue;
    const current = groups.get(key) ?? [];
    current.push(trajectory);
    groups.set(key, current);
  }

  let created = 0;
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const exemplar = rows[0];
    const pattern = rows
      .flatMap((row) => normalizeSteps(row.steps).slice(0, 5))
      .map((step) => ({ subgoal: step.subgoal, toolName: step.toolName }));
    await store.trajectoryTemplate.create({
      data: {
        createdFromIds: rows.map((row) => String(row.agentRunId ?? "")).filter(Boolean),
        goalEmbedding: goalEmbedding(key),
        name: `Procedure: ${key}`,
        pattern,
        successRate: 1,
        usageCount: rows.length,
      },
    });
    if (exemplar) created += 1;
  }

  return { created };
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
  if (!store.agentRunTrajectory?.findMany) return [];
  const rows = await store.agentRunTrajectory.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    where: { outcome: "FAILED" },
  }) as RawTrajectory[];

  return rows.map((row) => ({
    ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
    agentRunId: String(row.agentRunId ?? ""),
    goal: redactSecrets(row.goal ?? "Failed task"),
    outcomeReason: row.outcomeReason ?? null,
    steps: normalizeSteps(row.steps),
  }));
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
