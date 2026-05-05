import { prisma } from "../lib/prisma";
import type { ProviderId } from "../providers/types";

export interface AgentRunRunnerStore {
  agentRun: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<unknown>;
  };
  conversation: {
    create(args: unknown): Promise<{ id: string }>;
  };
  project: {
    upsert(args: unknown): Promise<{ id: string }>;
  };
  user: {
    upsert(args: unknown): Promise<unknown>;
  };
}

function fallbackEmailForUserId(userId: string) {
  return `${encodeURIComponent(userId)}@handle.local`;
}

function backendToDb(value: "e2b" | "local" | undefined) {
  return value === "local" ? "LOCAL" : "E2B";
}

export async function createAgentRun({
  backend,
  goal,
  providerOverride,
  store = prisma,
  userId,
}: {
  backend?: "e2b" | "local";
  goal: string;
  providerOverride?: ProviderId;
  store?: AgentRunRunnerStore;
  userId: string;
}) {
  await store.user.upsert({
    create: { email: fallbackEmailForUserId(userId), id: userId },
    update: {},
    where: { id: userId },
  });
  const project = await store.project.upsert({
    create: {
      defaultBackend: backendToDb(backend),
      id: "default-project",
      name: "Personal",
    },
    update: {},
    where: { id: "default-project" },
  });
  const conversation = await store.conversation.create({
    data: {
      messages: { create: { content: goal, role: "USER" } },
      projectId: project.id,
      title: goal.trim().slice(0, 80) || "New conversation",
    },
  });
  return store.agentRun.create({
    data: {
      backend: backendToDb(backend),
      conversationId: conversation.id,
      goal,
      ...(providerOverride ? { providerId: providerOverride } : {}),
      status: "RUNNING",
      userId,
    },
  });
}

export async function listAgentRuns({
  store = prisma,
  userId,
}: {
  store?: Pick<AgentRunRunnerStore, "agentRun">;
  userId: string;
}) {
  return store.agentRun.findMany({
    include: { conversation: { select: { projectId: true, title: true } } },
    orderBy: { startedAt: "desc" },
    take: 100,
    where: { userId },
  });
}

export async function getAgentRun({
  id,
  store = prisma,
  userId,
}: {
  id: string;
  store?: Pick<AgentRunRunnerStore, "agentRun">;
  userId: string;
}) {
  return store.agentRun.findFirst({
    include: {
      conversation: { include: { project: true } },
      handoffs: { orderBy: { createdAt: "asc" } },
      subRuns: { orderBy: { createdAt: "asc" } },
    },
    where: { id, userId },
  });
}

export async function startAgentRun({
  agentExecutionMode,
  runAgent,
  runId,
  goal,
  backend,
  providerOverride,
}: {
  agentExecutionMode?: string;
  backend?: "e2b" | "local";
  goal: string;
  providerOverride?: ProviderId;
  runAgent: (
    runId: string,
    goal: string,
    options?: { agentExecutionMode?: string; backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  runId: string;
}) {
  const promise = runAgent(runId, goal, {
    ...(agentExecutionMode ? { agentExecutionMode } : {}),
    ...(backend ? { backend } : {}),
    ...(providerOverride ? { providerOverride } : {}),
  });
  promise.catch(() => undefined);
  return { runId, started: true };
}

export { cancelAgentRunById as cancelAgentRun } from "../agent/cancelAgentRun";
export { pauseAgentRunById as pauseAgentRun } from "../agent/pauseAgentRun";
export { resumeAgentRunById as resumeAgentRun } from "../agent/resumeAgentRun";
