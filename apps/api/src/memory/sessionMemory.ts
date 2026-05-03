import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets, redactSecretsWithReport } from "../lib/redact";
import {
  getZepClient,
  type HandleZepClient,
  type ZepMemoryMessage,
  type ZepMemorySearchResult,
} from "./zepClient";
import { appendMemoryLog } from "./memoryLog";

export type MemoryScope = "GLOBAL_AND_PROJECT" | "PROJECT_ONLY" | "NONE";

export interface MemoryProjectContext {
  id?: string | null;
  memoryScope?: MemoryScope | null | undefined;
}

export interface MemoryMessageContext {
  content: string;
  conversationId?: string | null | undefined;
  extractionMode?: "auto" | "explicit_fact";
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
  const startedAt = Date.now();
  const redaction = redactSecretsWithReport(context.content);
  const status = await client.checkConnection();
  if (status.status !== "online") {
    emitMemoryStatus(context.conversationId ?? "memory", status);
    return { ok: false, skipped: true };
  }
  emitMemoryStatus(context.conversationId ?? "memory", status);

  await client.ensureUser({ userId });
  const conversationMessage: ZepMemoryMessage = {
    content: redaction.redacted,
    metadata: {
      conversationId: context.conversationId ?? null,
      source_type: "conversation",
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
  const conversationSessions = sessions.filter((session) => session.source === "conversation");
  for (const session of conversationSessions) {
    logMemoryDiagnostic({
      context,
      details: {
        factPreview: conversationMessage.content.slice(0, 160),
        operation: "memory.write",
        requestedProjectId: context.project?.id ?? null,
        targetGroupId: session.id,
        targetSource: session.source,
      },
      durationMs: Date.now() - startedAt,
      operation: "memory.write",
      status: "ok",
    });
    await client.ensureSession({
      metadata: {
        conversationId: context.conversationId ?? null,
        projectId: context.project?.id ?? null,
        source: session.source,
      },
      sessionId: session.id,
      userId,
    });
    await client.addMemoryMessages({ messages: [conversationMessage], sessionId: session.id });
  }

  if (context.role !== "USER") return { ok: true, skipped: false };

  if (redaction.redactionTriggered) {
    logMemoryDiagnostic({
      context,
      details: {
        operation: "memory.extraction_skipped",
        patterns: redaction.matchedPatterns,
        reason: "redaction_triggered",
      },
      durationMs: Date.now() - startedAt,
      operation: "memory.extraction_skipped",
      status: "ok",
    });
    return { ok: true, skipped: false };
  }

  const factMessages = extractMemoryFactMessages(context, validAt);
  if (factMessages.length === 0) {
    logMemoryDiagnostic({
      context,
      details: {
        factPreview: context.content.slice(0, 160),
        operation: "memory.extraction_skipped",
        reason: "not_fact_worthy",
      },
      durationMs: Date.now() - startedAt,
      operation: "memory.extraction_skipped",
      status: "ok",
    });
    return { ok: true, skipped: false };
  }

  const factSessions = sessions.filter((session) => session.source === "global" || session.source === "project");
  for (const session of factSessions) {
    await client.ensureSession({
      metadata: {
        conversationId: context.conversationId ?? null,
        projectId: context.project?.id ?? null,
        source: session.source,
      },
      sessionId: session.id,
      userId,
    });
    const existing = await client.getSessionMemory({ sessionId: session.id });
    let existingMessages = existing.ok && existing.value ? existing.value : [];

    for (const message of factMessages) {
      logMemoryDiagnostic({
        context,
        details: {
          factPreview: message.content.slice(0, 160),
          operation: "memory.write",
          requestedProjectId: context.project?.id ?? null,
          targetGroupId: session.id,
          targetSource: session.source,
        },
        durationMs: Date.now() - startedAt,
        operation: "memory.write",
        status: "ok",
      });
      const inferredFact = inferBitemporalFact(message.content);
      if (inferredFact) {
        const nextMessages = invalidateContradictedMessages(existingMessages, {
          invalidAt: validAt,
          key: inferredFact.key,
          nextValue: inferredFact.value,
        });
        if (nextMessages.changed) {
          existingMessages = hasActiveDuplicateMemoryMessage(nextMessages.messages, message)
            ? nextMessages.messages
            : [...nextMessages.messages, message];
          await client.deleteSessionMemory({ sessionId: session.id });
          await client.addMemoryMessages({
            messages: existingMessages,
            sessionId: session.id,
          });
          continue;
        }
      }

      if (hasActiveDuplicateMemoryMessage(existingMessages, message)) {
        continue;
      }

      await client.addMemoryMessages({ messages: [message], sessionId: session.id });
      existingMessages = [...existingMessages, message];
    }
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
  const startedAt = Date.now();
  logMemoryDiagnostic({
    context,
    details: {
      goalPreview: context.goal.slice(0, 160),
      operation: "memory.recall",
      projectId: context.project?.id ?? null,
      queryNamespaces: sessions.map((session) => ({
        sessionId: session.id,
        source: session.source,
      })),
      scope: effectiveMemoryScope(context.project),
      zepGroupId: context.project?.id ? `project_${context.project.id}` : null,
      zepUserId: `global_${sanitizeId(userId)}`,
    },
    durationMs: Date.now() - startedAt,
    operation: "memory.recall",
    status: "ok",
  });
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
    const stored = await client.getSessionMemory({ sessionId: session.id });
    const storedByContent =
      stored.ok && stored.value
        ? new Map(
            stored.value.map((message) => [
              normalizeMemoryContentKey(message.content),
              message,
            ]),
          )
        : new Map<string, ZepMemoryMessage>();
    results.push(
      ...search.value.map((item) =>
        memoryFactFromSearch(
          mergeSearchMetadataFromStoredMessage(item, storedByContent),
          session.source,
        ),
      ),
    );
  }

  return dedupeFacts(results).slice(0, 8);
}

function logMemoryDiagnostic({
  context,
  details,
  durationMs,
  operation,
  status,
}: {
  context: Pick<MemoryMessageContext, "conversationId" | "project"> | Pick<MemoryRecallContext, "conversationId" | "project">;
  details: Record<string, unknown>;
  durationMs: number;
  operation: string;
  status: "error" | "offline" | "ok";
}) {
  void appendMemoryLog({
    conversationId: context.conversationId ?? undefined,
    details,
    durationMs,
    operation,
    projectId: context.project?.id ?? undefined,
    provider: "self-hosted",
    scope: effectiveMemoryScope(context.project),
    status,
  }).catch(() => undefined);
}

function extractMemoryFactMessages(
  context: MemoryMessageContext,
  validAt: string,
): ZepMemoryMessage[] {
  const facts =
    context.extractionMode === "explicit_fact"
      ? normalizeExplicitMemoryFact(context.content)
      : normalizeAutomaticMemoryFacts(context.content);
  const seen = new Set<string>();

  return facts
    .map((content) => content.trim())
    .filter((content) => {
      const key = normalizeMemoryContentKey(content);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((content) => {
      const inferredFact = inferBitemporalFact(content);
      return {
        content,
        metadata: {
          ...(inferredFact ? { bitemporalKey: inferredFact.key, bitemporalValue: inferredFact.value } : {}),
          conversationId: context.conversationId ?? null,
          projectId: context.project?.id ?? null,
          role: context.role,
          source_type: "stated",
          valid_at: validAt,
        },
        role: "user" as const,
      };
    });
}

function normalizeExplicitMemoryFact(content: string) {
  const normalized =
    normalizeDeclarativeFact(stripRememberPrefix(cleanMemoryInput(content))) ??
    normalizeDeclarativeFact(cleanMemoryInput(content)) ??
    ensureSentence(cleanMemoryInput(content));
  return normalized ? [normalized] : [];
}

function normalizeAutomaticMemoryFacts(content: string) {
  const cleaned = cleanMemoryInput(content);
  if (cleaned.length < 10) return [];
  if (/\b(?:test|audit)\b/i.test(cleaned)) return [];
  if (/[?]\s*$/.test(cleaned)) return [];

  const rememberMatch = cleaned.match(/^remember\s+(?:that\s+)?(.+)$/i);
  if (rememberMatch?.[1]) {
    const remembered = cleanMemoryInput(rememberMatch[1]);
    const fact = normalizeDeclarativeFact(remembered);
    return fact ? [fact] : [];
  }

  if (/^(?:tell me|suggest|run|list|show me|create|write|delete|open|navigate|click|use|submit)\b/i.test(cleaned)) {
    return [];
  }

  const fact = normalizeDeclarativeFact(cleaned);
  return fact ? [fact] : [];
}

function normalizeDeclarativeFact(content: string) {
  const cleaned = cleanMemoryInput(content);
  const favorite = cleaned.match(/^my favorite ([a-z0-9][a-z0-9\s_-]{1,80}) is (.+)$/i);
  if (favorite?.[1] && favorite[2]) {
    return ensureSentence(`User's favorite ${normalizeNoun(favorite[1])} is ${cleanFactValue(favorite[2])}`);
  }

  const myFact = cleaned.match(/^my ([a-z0-9][a-z0-9\s_-]{1,80}) is (.+)$/i);
  if (myFact?.[1] && myFact[2]) {
    return ensureSentence(`User's ${normalizeNoun(myFact[1])} is ${cleanFactValue(myFact[2])}`);
  }

  const patterns: Array<[RegExp, (value: string) => string]> = [
    [/^i am (.+)$/i, (value) => `User is ${cleanFactValue(value)}`],
    [/^i have (.+)$/i, (value) => `User has ${cleanFactValue(value)}`],
    [/^i prefer (.+)$/i, (value) => `User prefers ${cleanFactValue(value)}`],
    [/^i drive (.+)$/i, (value) => `User drives ${cleanFactValue(value)}`],
    [/^i use (.+)$/i, (value) => `User uses ${cleanFactValue(value)}`],
    [/^i live in (.+)$/i, (value) => `User lives in ${cleanPlaceValue(value)}`],
    [/^i now live in (.+)$/i, (value) => `User lives in ${cleanPlaceValue(value)}`],
    [/^i moved to (.+)$/i, (value) => `User lives in ${cleanPlaceValue(value)}`],
  ];

  for (const [pattern, format] of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return ensureSentence(format(match[1]));
  }

  return null;
}

function stripRememberPrefix(content: string) {
  return content.replace(/^remember\s+(?:that\s+)?/i, "");
}

function cleanMemoryInput(content: string) {
  return content.trim().replace(/\s+/g, " ").replace(/^["']|["']$/g, "").replace(/[.!,;:]+$/g, "");
}

function cleanFactValue(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[.!,;:]+$/g, "");
}

function cleanPlaceValue(value: string) {
  return cleanFactValue(value).replace(/\s+(?:last week|today|yesterday|now)$/i, "");
}

function normalizeNoun(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function ensureSentence(value: string | null) {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
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
  const scope =
    context.scope ??
    (effectiveMemoryScope(context.project) === "GLOBAL_AND_PROJECT" ? "all" : "project");
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
  if (facts.length === 0) return "<memory_context>None recalled</memory_context>";
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

function mergeSearchMetadataFromStoredMessage(
  item: ZepMemorySearchResult,
  storedByContent: Map<string, ZepMemoryMessage>,
): ZepMemorySearchResult {
  const stored = storedByContent.get(normalizeMemoryContentKey(item.content));
  if (!stored?.metadata) return item;
  return {
    ...item,
    metadata: {
      ...stored.metadata,
      ...item.metadata,
    },
  };
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
    normalized.match(/\buser\s+lives\s+in\s+([A-Za-z][A-Za-z\s.'-]{1,80})/i) ??
    normalized.match(/\buser\s+moved\s+to\s+([A-Za-z][A-Za-z\s.'-]{1,80})/i) ??
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

function hasActiveDuplicateMemoryMessage(
  messages: ZepMemoryMessage[],
  nextMessage: ZepMemoryMessage,
) {
  const nextKey = normalizeMemoryContentKey(nextMessage.content);
  return messages.some((message) => {
    if (typeof message.metadata?.invalid_at === "string") return false;
    return normalizeMemoryContentKey(message.content) === nextKey;
  });
}

function normalizeMemoryContentKey(content: string) {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
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
