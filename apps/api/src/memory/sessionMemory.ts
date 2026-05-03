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
  validAt?: string | null | undefined;
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
  invalidAt?: string | null;
  source: "global" | "project";
  score?: number;
  sourceType?: "inferred" | "stated";
  validAt?: string | null;
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
  if (memoryEnabled === true) return true;
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
  const validAt = normalizeIsoTimestamp(context.validAt) ?? new Date().toISOString();
  const inferredFact = inferBitemporalFact(context.content);
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
      ...(inferredFact ? { bitemporalKey: inferredFact.key, bitemporalValue: inferredFact.value } : {}),
      conversationId: context.conversationId ?? null,
      source_type: "stated",
      valid_at: validAt,
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
    if (inferredFact) {
      const existing = await client.getSessionMemory({ sessionId: session.id });
      const existingMessages = existing.ok && existing.value ? existing.value : [];
      const nextMessages = invalidateContradictedMessages(existingMessages, {
        invalidAt: validAt,
        key: inferredFact.key,
        nextValue: inferredFact.value,
      });
      if (nextMessages.changed) {
        await client.deleteSessionMemory({ sessionId: session.id });
        await client.addMemoryMessages({
          messages: [...nextMessages.messages, message],
          sessionId: session.id,
        });
        continue;
      }
    }

    await client.addMemoryMessages({ messages: [message], sessionId: session.id });
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
    ...facts.map((fact, index) => `${index + 1}. ${formatFactForPrompt(fact)}`),
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
  if (typeof item.metadata?.valid_at === "string") fact.validAt = item.metadata.valid_at;
  if (typeof item.metadata?.invalid_at === "string") fact.invalidAt = item.metadata.invalid_at;
  if (item.metadata?.source_type === "inferred" || item.metadata?.source_type === "stated") {
    fact.sourceType = item.metadata.source_type;
  }
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

function normalizeIsoTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferBitemporalFact(content: string) {
  const normalized = content.trim();
  const match =
    normalized.match(/\b(?:i\s+live\s+in|i\s+moved\s+to|i\s+now\s+live\s+in)\s+([A-Za-z][A-Za-z\s.'-]{1,80})/i) ??
    normalized.match(/\bmy\s+(?:current\s+)?city\s+is\s+([A-Za-z][A-Za-z\s.'-]{1,80})/i);
  if (!match?.[1]) return null;
  return {
    key: "residence",
    value: match[1].replace(/[.!,;:]+$/g, "").trim().toLowerCase(),
  };
}

function invalidateContradictedMessages(
  messages: ZepMemoryMessage[],
  input: { invalidAt: string; key: string; nextValue: string },
) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    const metadata = message.metadata ?? {};
    if (
      metadata.bitemporalKey === input.key &&
      metadata.bitemporalValue !== input.nextValue &&
      typeof metadata.invalid_at !== "string"
    ) {
      changed = true;
      return {
        ...message,
        metadata: {
          ...metadata,
          invalid_at: input.invalidAt,
        },
      };
    }
    return message;
  });
  return { changed, messages: nextMessages };
}

function formatFactForPrompt(fact: MemoryFact) {
  const sourceType = fact.sourceType ?? "stated";
  const validAt = formatPromptDate(fact.validAt);
  const invalidAt = formatPromptDate(fact.invalidAt);
  const validity =
    validAt && invalidAt
      ? `valid ${validAt} to ${invalidAt}`
      : validAt
        ? `valid since ${validAt}`
        : "validity unknown";
  return `[${sourceType}, ${validity}] ${fact.content}`;
}

function formatPromptDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
