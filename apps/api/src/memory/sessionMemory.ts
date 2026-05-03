import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import {
  getZepClient,
  type HandleZepClient,
  type ZepMemoryMessage,
  type ZepMemorySearchResult,
} from "./zepClient";

export type MemoryScope = "GLOBAL_AND_PROJECT" | "PROJECT_ONLY" | "NONE";

export interface MemoryProjectContext {
  id?: string | null;
  memoryScope?: MemoryScope | null | undefined;
}

export interface MemoryMessageContext {
  content: string;
  conversationId?: string | null | undefined;
  memoryEnabled?: boolean | null | undefined;
  project?: MemoryProjectContext | null | undefined;
  role: "ASSISTANT" | "SYSTEM" | "TOOL" | "USER";
  userId?: string | null | undefined;
}

export interface MemoryRecallContext {
  conversationId?: string | null | undefined;
  goal: string;
  memoryEnabled?: boolean | null | undefined;
  project?: MemoryProjectContext | null | undefined;
  taskId: string;
  userId?: string | null | undefined;
}

export interface MemoryFact {
  content: string;
  source: "global" | "project";
  score?: number;
}

const DEFAULT_MEMORY_USER_ID = "handle-local-user";

export function memoryUserId() {
  return process.env.HANDLE_MEMORY_USER_ID ?? DEFAULT_MEMORY_USER_ID;
}

export function effectiveMemoryScope(project?: MemoryProjectContext | null): MemoryScope {
  return project?.memoryScope ?? "GLOBAL_AND_PROJECT";
}

export function isMemoryEnabled({
  memoryEnabled,
  project,
}: {
  memoryEnabled?: boolean | null | undefined;
  project?: MemoryProjectContext | null | undefined;
}) {
  if (memoryEnabled === false) return false;
  return effectiveMemoryScope(project) !== "NONE";
}

export function memorySessionIds({
  conversationId,
  project,
  userId = memoryUserId(),
}: {
  conversationId?: string | null | undefined;
  project?: MemoryProjectContext | null | undefined;
  userId?: string;
}) {
  const scope = effectiveMemoryScope(project);
  const sessionIds: Array<{ id: string; source: "conversation" | "global" | "project" }> = [];

  if (conversationId) {
    sessionIds.push({ id: `conv_${conversationId}`, source: "conversation" });
  }

  if (scope === "GLOBAL_AND_PROJECT") {
    sessionIds.push({ id: `global_${sanitizeId(userId)}`, source: "global" });
  }

  if ((scope === "GLOBAL_AND_PROJECT" || scope === "PROJECT_ONLY") && project?.id) {
    sessionIds.push({ id: `project_${project.id}`, source: "project" });
  }

  return sessionIds;
}

export async function appendMessageToZep(
  context: MemoryMessageContext,
  client: HandleZepClient = getZepClient(),
) {
  if (!context.project) return { ok: true, skipped: true };
  if (!isMemoryEnabled(context)) return { ok: true, skipped: true };

  const userId = context.userId ?? memoryUserId();
  const status = await client.checkConnection();
  if (status.status !== "online") {
    emitMemoryStatus(context.conversationId ?? "memory", status);
    return { ok: false, skipped: true };
  }
  emitMemoryStatus(context.conversationId ?? "memory", status);

  await client.ensureUser({ userId });
  const message: ZepMemoryMessage = {
    content: redactSecrets(context.content),
    metadata: {
      conversationId: context.conversationId ?? null,
      projectId: context.project?.id ?? null,
      role: context.role,
    },
    role: context.role === "ASSISTANT" ? "assistant" : "user",
  };

  const sessions = memorySessionIds({
    conversationId: context.conversationId,
    project: context.project,
    userId,
  });
  for (const session of sessions) {
    await client.ensureSession({
      metadata: {
        conversationId: context.conversationId ?? null,
        projectId: context.project?.id ?? null,
        source: session.source,
      },
      sessionId: session.id,
      userId,
    });
    await client.addMemoryMessages({
      messages: [message],
      sessionId: session.id,
    });
  }

  return { ok: true, skipped: false };
}

export async function getRelevantMemoryForTask(
  context: MemoryRecallContext,
  client: HandleZepClient = getZepClient(),
): Promise<MemoryFact[]> {
  if (!context.project) return [];
  if (!isMemoryEnabled(context)) return [];

  const status = await client.checkConnection();
  emitMemoryStatus(context.taskId, status);
  if (status.status !== "online") return [];

  const userId = context.userId ?? memoryUserId();
  await client.ensureUser({ userId });
  const sessions = memorySessionIds({ project: context.project, userId })
    .filter((session) => session.source === "global" || session.source === "project");
  const results: MemoryFact[] = [];

  for (const session of sessions) {
    await client.ensureSession({
      metadata: { projectId: context.project?.id ?? null, source: session.source },
      sessionId: session.id,
      userId,
    });
    const search = await client.searchMemory({
      limit: 6,
      query: redactSecrets(context.goal),
      sessionId: session.id,
    });
    if (!search.ok || !search.value) continue;
    results.push(
      ...search.value.map((item) => memoryFactFromSearch(item, session.source)),
    );
  }

  return dedupeFacts(results).slice(0, 8);
}

export async function forgetMemoryForProject(
  context: {
    project?: MemoryProjectContext | null | undefined;
    scope?: "all" | "global" | "project";
    userId?: string | null | undefined;
  },
  client: HandleZepClient = getZepClient(),
) {
  if (!context.project) return { deletedSessions: 0 };
  if (effectiveMemoryScope(context.project) === "NONE") return { deletedSessions: 0 };

  const userId = context.userId ?? memoryUserId();
  const scope = context.scope ?? "project";
  const sessions = memorySessionIds({ project: context.project, userId }).filter(
    (session) =>
      (scope === "all" && (session.source === "global" || session.source === "project")) ||
      session.source === scope,
  );

  let deletedSessions = 0;
  for (const session of sessions) {
    const result = await client.deleteSessionMemory({ sessionId: session.id });
    if (result.ok) deletedSessions += 1;
  }
  return { deletedSessions };
}

export function formatMemoryContext(facts: MemoryFact[]) {
  if (facts.length === 0) return "";
  return [
    "<memory_context>",
    "Relevant memory recalled for this run:",
    ...facts.map((fact, index) => `${index + 1}. [${fact.source}] ${fact.content}`),
    "</memory_context>",
  ].join("\n");
}

function emitMemoryStatus(taskId: string, status: { detail?: string; provider: "cloud" | "self-hosted"; status: "online" | "offline" }) {
  emitTaskEvent({
    type: "memory_status",
    taskId,
    status: status.status,
    provider: status.provider,
    ...(status.detail ? { detail: redactSecrets(status.detail) } : {}),
    timestamp: new Date().toISOString(),
  });
}

function memoryFactFromSearch(
  item: ZepMemorySearchResult,
  source: "conversation" | "global" | "project",
): MemoryFact {
  const fact: MemoryFact = {
    content: redactSecrets(item.content),
    source: source === "project" ? "project" : "global",
  };
  if (typeof item.score === "number") fact.score = item.score;
  return fact;
}

function dedupeFacts(facts: MemoryFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = fact.content.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
