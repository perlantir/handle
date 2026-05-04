import type {
  CreateSkillWorkflowRequest,
  SkillWorkflowGraph,
  SkillWorkflowRunSummary,
  SkillWorkflowSummary,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { runSkill } from "./skillRunner";

type SkillStore = typeof prisma;

export async function createSkillWorkflow({
  input,
  store = prisma,
  userId,
}: {
  input: CreateSkillWorkflowRequest;
  store?: SkillStore;
  userId: string;
}) {
  validateGraph(input.graph);
  const row = await store.skillWorkflow.create({
    data: {
      description: input.description ? redactSecrets(input.description) : null,
      enabled: input.enabled ?? true,
      graph: jsonInput(input.graph),
      name: redactSecrets(input.name),
      projectId: input.visibility === "PROJECT" ? input.projectId ?? null : null,
      userId,
      visibility: input.visibility ?? "PERSONAL",
    },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return serializeWorkflow(row);
}

export async function listSkillWorkflows({
  projectId,
  store = prisma,
  userId,
}: {
  projectId?: string;
  store?: SkillStore;
  userId: string;
}) {
  const rows = await store.skillWorkflow.findMany({
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    where: {
      userId,
      OR: [
        { visibility: "PERSONAL" },
        ...(projectId ? [{ projectId, visibility: "PROJECT" as const }] : []),
      ],
    },
  });
  return rows.map(serializeWorkflow);
}

export async function runSkillWorkflow({
  inputs = {},
  store = prisma,
  userId,
  workflowId,
}: {
  inputs?: Record<string, unknown>;
  store?: SkillStore;
  userId: string;
  workflowId: string;
}) {
  const workflow = await store.skillWorkflow.findFirst({
    where: { enabled: true, id: workflowId, userId },
  });
  if (!workflow) throw new Error("Skill workflow not found");
  const graph = normalizeGraph(workflow.graph);
  validateGraph(graph);
  const run = await store.skillWorkflowRun.create({
    data: {
      artifactMap: {},
      inputs: jsonInput(inputs),
      projectId: workflow.projectId,
      status: "RUNNING",
      userId,
      workflowId: workflow.id,
    },
  });

  const artifactMap: Record<string, unknown> = {};
  const pending = new Map(graph.nodes.map((node) => [node.id, node]));
  const completed = new Set<string>();

  try {
    while (pending.size > 0) {
      const ready = Array.from(pending.values()).filter((node) => node.dependsOn.every((id) => completed.has(id)));
      if (ready.length === 0) throw new Error("Workflow graph contains a cycle or missing dependency");
      const parallelGroups = groupReadyNodes(ready);
      for (const group of parallelGroups) {
        const results = await Promise.all(group.map((node) => runWorkflowNode({
          artifactMap,
          graph,
          node,
          store,
          userId,
          ...(workflow.projectId ? { workflowProjectId: workflow.projectId } : {}),
        })));
        for (const result of results) {
          artifactMap[result.nodeId] = result.artifacts;
          completed.add(result.nodeId);
          pending.delete(result.nodeId);
        }
      }
    }
    const updated = await store.skillWorkflowRun.update({
      data: {
        artifactMap: jsonInput(artifactMap),
        completedAt: new Date(),
        status: "COMPLETED",
      },
      where: { id: run.id },
    });
    return serializeWorkflowRun(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skill workflow failed";
    const updated = await store.skillWorkflowRun.update({
      data: {
        artifactMap: jsonInput(artifactMap),
        completedAt: new Date(),
        errorCode: "skill_workflow_failed",
        errorMessage: redactSecrets(message),
        status: "FAILED",
      },
      where: { id: run.id },
    });
    return serializeWorkflowRun(updated);
  }
}

async function runWorkflowNode({
  artifactMap,
  graph,
  node,
  store,
  userId,
  workflowProjectId,
}: {
  artifactMap: Record<string, unknown>;
  graph: SkillWorkflowGraph;
  node: SkillWorkflowGraph["nodes"][number];
  store: SkillStore;
  userId: string;
  workflowProjectId?: string;
}) {
  const boundInputs = { ...node.inputs };
  for (const binding of graph.artifactBindings.filter((item) => item.toNodeId === node.id)) {
    const artifacts = artifactMap[binding.fromNodeId];
    if (Array.isArray(artifacts)) {
      const match = artifacts.find((artifact) => artifact.kind === binding.artifactKind);
      if (match) boundInputs[binding.inputSlotId] = match.inlineContent ?? match.title;
    }
  }
  const result = await runSkill({
    request: {
      inputs: boundInputs,
      ...(workflowProjectId ? { projectId: workflowProjectId } : {}),
      trigger: "WORKFLOW",
    },
    skillIdOrSlug: node.skillId,
    store,
    userId,
  });
  if (result.status !== "COMPLETED" && !node.optional) {
    throw new Error(`Workflow node ${node.id} failed: ${result.errorMessage ?? result.status}`);
  }
  return { artifacts: result.artifacts, nodeId: node.id };
}

function groupReadyNodes(nodes: SkillWorkflowGraph["nodes"]) {
  const grouped = new Map<string, SkillWorkflowGraph["nodes"]>();
  for (const node of nodes) {
    const key = node.parallelGroup ?? node.id;
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  }
  return Array.from(grouped.values());
}

function validateGraph(graph: SkillWorkflowGraph) {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error("Workflow requires at least one Skill node");
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    if (!node.id || !node.skillId) throw new Error("Workflow nodes require id and skillId");
    for (const dependency of node.dependsOn ?? []) {
      if (!nodeIds.has(dependency)) throw new Error(`Workflow dependency ${dependency} does not exist`);
    }
  }
}

function serializeWorkflow(row: {
  createdAt?: Date;
  description?: string | null;
  enabled: boolean;
  graph: unknown;
  id: string;
  name: string;
  projectId?: string | null;
  runs?: Array<{
    artifactMap: unknown;
    completedAt?: Date | null;
    createdAt?: Date;
    errorCode?: string | null;
    errorMessage?: string | null;
    id: string;
    inputs: unknown;
    projectId?: string | null;
    status: string;
    temporalWorkflowId?: string | null;
    userId?: string;
    workflowId: string;
  }>;
  updatedAt?: Date;
  userId?: string;
  visibility: string;
}): SkillWorkflowSummary {
  return stripUndefined({
    createdAt: row.createdAt?.toISOString(),
    description: row.description ?? null,
    enabled: row.enabled,
    graph: normalizeGraph(row.graph),
    id: row.id,
    name: row.name,
    projectId: row.projectId ?? null,
    recentRun: row.runs?.[0] ? serializeWorkflowRun(row.runs[0] as never) : null,
    updatedAt: row.updatedAt?.toISOString(),
    ...(row.userId ? { userId: row.userId } : {}),
    visibility: row.visibility as SkillWorkflowSummary["visibility"],
  }) as SkillWorkflowSummary;
}

function serializeWorkflowRun(row: {
  artifactMap: unknown;
  completedAt?: Date | null;
  createdAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  id: string;
  inputs: unknown;
  projectId?: string | null;
  status: string;
  temporalWorkflowId?: string | null;
  userId?: string;
  workflowId: string;
}): SkillWorkflowRunSummary {
  return stripUndefined({
    artifactMap: normalizeRecord(row.artifactMap),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    id: row.id,
    inputs: normalizeRecord(row.inputs),
    projectId: row.projectId ?? null,
    status: row.status as SkillWorkflowRunSummary["status"],
    temporalWorkflowId: row.temporalWorkflowId ?? null,
    ...(row.userId ? { userId: row.userId } : {}),
    workflowId: row.workflowId,
  }) as SkillWorkflowRunSummary;
}

function normalizeGraph(value: unknown): SkillWorkflowGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { artifactBindings: [], nodes: [] };
  const record = value as Partial<SkillWorkflowGraph>;
  return {
    artifactBindings: Array.isArray(record.artifactBindings) ? record.artifactBindings : [],
    nodes: Array.isArray(record.nodes)
      ? record.nodes.map((node) => ({
          dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [],
          id: String(node.id),
          inputs: normalizeRecord(node.inputs),
          optional: Boolean(node.optional),
          ...(node.parallelGroup ? { parallelGroup: String(node.parallelGroup) } : {}),
          skillId: String(node.skillId),
        }))
      : [],
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
