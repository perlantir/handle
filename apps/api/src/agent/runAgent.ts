import { E2BBackend, type E2BBackendOptions } from "../execution/e2bBackend";
import type { E2BSandboxLike, ExecutionBackend } from "../execution/types";
import { createBrowserDesktopSandbox } from "../execution/browserSession";
import {
  LocalBackend,
  type LocalBackendOptions,
} from "../execution/localBackend";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { emitTaskEvent } from "../lib/eventBus";
import { appendActionLog, recentActionLogContext } from "../lib/actionLog";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import {
  appendMessageToZep,
  formatMemoryContext,
  getRelevantMemoryForTask,
  type MemoryFact,
} from "../memory/sessionMemory";
import {
  findSimilarFailedTrajectories,
  findSimilarSuccessfulTrajectories,
  formatFailureMemoryContext,
  formatProceduralMemoryContext,
  synthesizeTrajectoryTemplates,
} from "../memory/proceduralMemory";
import {
  ensureSharedMemoryNamespace,
  type SharedMemoryStore,
} from "../memory/sharedMemory";
import {
  completeTrajectory,
  failureReasonFromError,
  initializeTrajectory,
  recordTrajectoryStep,
  trajectoryOutcomeFromStatus,
  type TrajectoryStepRecord,
  type TrajectoryStore,
} from "../memory/trajectoryMemory";
import { providerRegistry as defaultProviderRegistry } from "../providers/registry";
import { notifyTaskEvent } from "../notifications/notificationService";
import {
  isProviderId,
  type ProviderId,
  type ProviderInstance,
} from "../providers/types";
import { createHandleAgent } from "./createAgent";
import { createComputerUseToolDefinitions } from "./computerUseTools";
import {
  CriticRejectedError,
  criticEnabled,
  formatCriticFeedback,
  isCriticRejectedError,
  runCriticReview,
  shouldCriticReviewToolStep,
} from "./critic";
import { parseAgentFinalResult } from "./finalResult";
import { emitInitialPlan } from "./plan";
import {
  createAgentRunCheckpoint,
  latestCheckpointContext,
} from "./runCheckpoint";
import {
  beginAgentRun,
  cancelReason,
  isAgentRunPausedSignal,
  isAgentRunCancelledError,
  pauseReason,
} from "./runControl";
import { isSmokeAgentEnabled, runSmokeAgent } from "./smokeAgent";
import { ensureTodoMd, formatTodoMdContext, type TodoMdResult } from "./todoMd";

const PLAN_GENERATION_TIMEOUT_MS = Number.parseInt(
  process.env.HANDLE_PLAN_GENERATION_TIMEOUT_MS ?? "60000",
  10,
);

function eventContentToString(content: unknown) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "object" &&
          part &&
          "text" in part &&
          typeof part.text === "string"
        )
          return part.text;
        return "";
      })
      .join("");
  }

  return "";
}

function getFinalOutput(output: unknown) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return eventContentToString(output);
  if (typeof output === "object" && output && "output" in output) {
    return getFinalOutput(output.output);
  }

  return null;
}

interface AgentStreamEvent {
  data?: {
    chunk?: { content?: unknown };
    output?: unknown;
  };
  event?: string;
  name?: string;
}

interface AgentLike {
  streamEvents(
    input: { chat_history: unknown[]; input: string },
    options: { signal?: AbortSignal; version: "v2" },
  ): AsyncIterable<AgentStreamEvent>;
}

interface TaskStore {
  agentRunCheckpoint?: {
    create?(args: unknown): Promise<unknown>;
    findFirst?(args: unknown): Promise<unknown | null>;
  };
  agentRunTrajectory?: TrajectoryStore["agentRunTrajectory"];
  sharedMemoryNamespace?: SharedMemoryStore["sharedMemoryNamespace"];
  criticReview?: {
    create(args: unknown): Promise<unknown>;
  };
  message: {
    create(args: unknown): Promise<unknown>;
  };
  agentRun?: {
    findFirst?(args: unknown): Promise<unknown | null>;
    findUnique(args: unknown): Promise<AgentRunContext | null>;
    update(args: unknown): Promise<unknown>;
  };
  task?: {
    findUnique(
      args: unknown,
    ): Promise<{
      backend: string | null;
      providerOverride: string | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

interface ProjectContext {
  browserMode: string | null;
  criticEnabled?: boolean | null;
  criticMaxRevisions?: number | null;
  criticModel?: string | null;
  criticScope?: string | null;
  customScopePath: string | null;
  defaultBackend: string | null;
  defaultModel: string | null;
  defaultProvider: string | null;
  id: string;
  memoryScope: string | null;
  permissionMode: string | null;
  workspaceScope: string | null;
}

interface AgentRunContext {
  backend: string | null;
  conversationId: string;
  conversation?: {
    messages?: Array<{
      content: string;
      memoryEnabled?: boolean | null;
      role: string;
    }>;
    project?: ProjectContext | null;
  } | null;
  providerId: string | null;
  modelName: string | null;
  status?: string | null;
  userId?: string | null;
}

interface SafetySettingsStore {
  safetySettings?: {
    findUnique(args: unknown): Promise<{ trustedDomains: unknown } | null>;
  };
}

interface BrowserSettingsStore {
  browserSettings?: {
    findUnique(args: unknown): Promise<{ mode: string } | null>;
  };
}

interface ProviderRegistryLike {
  getActiveModel(args: {
    modelOverride?: string;
    taskId: string;
    taskOverride?: ProviderId;
  }): Promise<{
    model: BaseChatModel;
    provider: ProviderInstance;
  }>;
  initialize(): Promise<void>;
}

interface AgentExecutionBackend extends ExecutionBackend {
  getSandbox(): E2BSandboxLike;
}

interface RunAgentDependencies {
  createAgent?: (
    context: {
      backend: ExecutionBackend;
      criticReviewToolResult?: (
        step: TrajectoryStepRecord,
        output: string,
      ) => Promise<string>;
      memoryContext?: string;
      recordTrajectoryStep?: (step: TrajectoryStepRecord) => Promise<void>;
      sandbox: E2BSandboxLike;
      sharedMemoryNamespaceId?: string;
      taskId: string;
      trustedDomains?: string[];
      userId?: string;
    },
    options: { llm: BaseChatModel },
  ) => Promise<AgentLike>;
  createBackend?: (options?: E2BBackendOptions) => AgentExecutionBackend;
  createLocalBackend?: (
    taskId: string,
    options?: LocalBackendOptions,
  ) => ExecutionBackend;
  createDesktopSandbox?: typeof createBrowserDesktopSandbox;
  createComputerUseTools?: typeof createComputerUseToolDefinitions;
  emitEvent?: typeof emitTaskEvent;
  emitPlan?: typeof emitInitialPlan;
  isSmokeEnabled?: typeof isSmokeAgentEnabled;
  providerRegistry?: ProviderRegistryLike;
  runSmoke?: typeof runSmokeAgent;
  store?: TaskStore;
}

export interface RunAgentOptions {
  backend?: "e2b" | "local";
  providerOverride?: ProviderId;
}

const PHASE_3_DESKTOP_GOAL_PATTERN =
  /\b(browser|browse|website|web page|webpage|navigate|click|selector|scroll|screenshot|screen|desktop|display|firefox|chrome|chromium|form|button|login|signin|checkout|payment)\b/i;
const DIRECT_COMPUTER_USE_GOAL_PATTERN =
  /\b(screenshot|screen|desktop|display)\b/i;
const BROWSER_GOAL_PATTERN =
  /\b(browser|browse|website|web page|webpage|navigate|click|selector|scroll|firefox|chrome|chromium|form|button|login|signin|checkout|payment)\b/i;

function shouldRunDirectComputerUse(goal: string) {
  return (
    DIRECT_COMPUTER_USE_GOAL_PATTERN.test(goal) &&
    !BROWSER_GOAL_PATTERN.test(goal)
  );
}

function normalizeProviderOverride(value: string | null | undefined) {
  if (!value) return undefined;
  return isProviderId(value) ? value : undefined;
}

function normalizeBackend(value: string | null | undefined) {
  return value === "local" || value === "LOCAL" ? "local" : "e2b";
}

function backendToDb(value: "e2b" | "local") {
  return value === "local" ? "LOCAL" : "E2B";
}

function runStatusToDb(
  status: "RUNNING" | "WAITING" | "STOPPED" | "ERROR" | "PAUSED" | "CANCELLED",
) {
  if (status === "STOPPED") return "COMPLETED";
  if (status === "ERROR") return "FAILED";
  if (status === "PAUSED") return "PAUSED";
  if (status === "CANCELLED") return "CANCELLED";
  return status;
}

async function loadRunContext(store: TaskStore, taskId: string) {
  if (store.agentRun) {
    return store.agentRun.findUnique({
      include: {
        conversation: {
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            project: true,
          },
        },
      },
      where: { id: taskId },
    });
  }

  if (!store.task) return null;
  const task = await store.task.findUnique({
    select: { backend: true, providerOverride: true },
    where: { id: taskId },
  });
  if (!task) return null;

  return {
    backend: task.backend,
    conversationId: taskId,
    conversation: null,
    modelName: null,
    providerId: task.providerOverride,
  };
}

async function updateRun(
  store: TaskStore,
  taskId: string,
  data: Record<string, unknown>,
) {
  if (store.agentRun) {
    const nextData = { ...data };
    if (typeof nextData.status === "string") {
      nextData.status = runStatusToDb(
        nextData.status as
          | "RUNNING"
          | "WAITING"
          | "STOPPED"
          | "ERROR"
          | "PAUSED"
          | "CANCELLED",
      );
      if (
        nextData.status === "COMPLETED" ||
        nextData.status === "FAILED" ||
        nextData.status === "CANCELLED"
      ) {
        nextData.completedAt = new Date();
      }
    }
    if (typeof nextData.backend === "string") {
      nextData.backend = backendToDb(normalizeBackend(nextData.backend));
    }
    await store.agentRun.update({ data: nextData, where: { id: taskId } });
    return;
  }

  if (store.task) {
    const legacyData = { ...data };
    delete legacyData.result;
    await store.task.update({ data: legacyData, where: { id: taskId } });
  }
}

async function createAssistantMessage(
  store: TaskStore,
  taskId: string,
  context: AgentRunContext | null,
  content: string,
  provider?: ProviderInstance,
) {
  if (store.agentRun && context?.conversationId) {
    await store.message.create({
      data: {
        agentRunId: taskId,
        content,
        conversationId: context.conversationId,
        modelName: provider?.config.primaryModel,
        providerId: provider?.id,
        role: "ASSISTANT",
      },
    });
    await appendMessageToZep({
      content,
      conversationId: context.conversationId,
      project: normalizeMemoryProjectContext(context.conversation?.project),
      role: "ASSISTANT",
    }).catch((err) => {
      logger.warn(
        { conversationId: context.conversationId, err, taskId },
        "Failed to append assistant message to memory",
      );
    });
    return;
  }

  await store.message.create({
    data: { content, role: "ASSISTANT", taskId },
  });
}

function conversationHistory(
  context: AgentRunContext | null,
  currentGoal: string,
) {
  const messages =
    context?.conversation?.messages?.filter(
      (message) => message.content.trim().length > 0,
    ) ?? [];
  const history =
    messages.at(-1)?.role === "USER" && messages.at(-1)?.content === currentGoal
      ? messages.slice(0, -1)
      : messages;

  return history.map((message) => ({
    content: redactSecrets(message.content),
    role: message.role.toLowerCase(),
  }));
}

function currentMessageMemoryEnabled(
  context: AgentRunContext | null,
  currentGoal: string,
) {
  const messages = context?.conversation?.messages ?? [];
  const current = messages.at(-1);
  if (
    current?.role === "USER" &&
    current.content === currentGoal &&
    typeof current.memoryEnabled === "boolean"
  ) {
    return current.memoryEnabled;
  }
  return null;
}

function normalizeMemoryProjectContext(
  project: ProjectContext | null | undefined,
) {
  if (!project?.memoryScope) return null;
  const memoryScope =
    project.memoryScope === "PROJECT_ONLY" || project.memoryScope === "NONE"
      ? project.memoryScope
      : "GLOBAL_AND_PROJECT";
  return { id: project.id, memoryScope } as const;
}

function localSandboxPlaceholder(taskId: string): E2BSandboxLike {
  const unsupported = async () => {
    throw new Error("Local backend does not expose an E2B sandbox");
  };

  return {
    commands: { run: unsupported },
    files: {
      list: unsupported,
      read: unsupported,
      write: unsupported,
    },
    kill: async () => undefined,
    sandboxId: `local:${taskId}`,
  };
}

function defaultProjectWorkspaceDir(
  projectId: string | undefined,
  taskId: string,
) {
  return join(
    homedir(),
    "Documents",
    "Handle",
    "workspaces",
    projectId ?? taskId,
  );
}

function localWorkspaceDirForProject(
  project: ProjectContext | null | undefined,
  taskId: string,
) {
  if (project?.workspaceScope === "CUSTOM_FOLDER" && project.customScopePath) {
    return project.customScopePath;
  }

  if (project?.workspaceScope === "DESKTOP") {
    return join(homedir(), "Desktop");
  }

  return defaultProjectWorkspaceDir(project?.id, taskId);
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function emitTodoMdFileEvent({
  backend,
  emitEvent,
  project,
  runContext,
  taskId,
  todo,
}: {
  backend: ExecutionBackend;
  emitEvent: typeof emitTaskEvent;
  project: ProjectContext | null;
  runContext: AgentRunContext;
  taskId: string;
  todo: TodoMdResult;
}) {
  const callId = randomUUID();
  emitEvent({
    args: {
      contentLength: todo.content.length,
      path: todo.path,
      reason: "Persistent task tracking",
    },
    callId,
    taskId,
    toolName: "file.write",
    type: "tool_call",
  });
  emitEvent({
    callId,
    result: `${todo.created ? "Created" : "Loaded"} ${todo.path}`,
    taskId,
    type: "tool_result",
  });
  if (todo.created) {
    await appendActionLog({
      conversationId: runContext.conversationId,
      description: `Created task todo file ${todo.path}`,
      metadata: { byteCount: todo.content.length, kind: "todo_md" },
      outcomeType: "file_created",
      projectId: project?.id ?? "unknown",
      reversible:
        backend.id === "local" &&
        todo.path.startsWith(backend.getWorkspaceDir()),
      target: todo.path,
      taskId,
      timestamp: new Date().toISOString(),
      ...(backend.id === "local" &&
      todo.path.startsWith(backend.getWorkspaceDir())
        ? { undoCommand: `rm ${shellQuote(todo.path)}` }
        : {}),
    }).catch((err) => {
      logger.warn(
        { err, path: todo.path, taskId },
        "Failed to action-log todo.md creation",
      );
    });
  }
}

function timeoutError(label: string, timeoutMs: number) {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

function normalizeTrustedDomains(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

async function loadTrustedDomains(store: TaskStore) {
  const safetyStore = store as TaskStore & SafetySettingsStore;
  if (!safetyStore.safetySettings) return [];

  const row = await safetyStore.safetySettings.findUnique({
    where: { id: "global" },
  });
  return normalizeTrustedDomains(row?.trustedDomains);
}

async function loadBrowserMode(store: TaskStore) {
  const browserStore = store as TaskStore & BrowserSettingsStore;
  if (!browserStore.browserSettings) return "separate-profile" as const;

  const row = await browserStore.browserSettings.findUnique({
    where: { id: "global" },
  });
  return row?.mode === "actual-chrome" ? "actual-chrome" : "separate-profile";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(timeoutError(label, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createAgentRunner({
  createAgent = createHandleAgent,
  createBackend = (options) => new E2BBackend(options),
  createLocalBackend = (taskId, options) => new LocalBackend(taskId, options),
  createComputerUseTools = createComputerUseToolDefinitions,
  createDesktopSandbox = createBrowserDesktopSandbox,
  emitEvent = emitTaskEvent,
  emitPlan = emitInitialPlan,
  isSmokeEnabled = isSmokeAgentEnabled,
  providerRegistry = defaultProviderRegistry,
  runSmoke = runSmokeAgent,
  store = prisma,
}: RunAgentDependencies = {}) {
  return async function runAgent(
    taskId: string,
    goal: string,
    options: RunAgentOptions = {},
  ) {
    const runControl = beginAgentRun(taskId);

    if (isSmokeEnabled()) {
      try {
        await runSmoke(taskId, goal, { signal: runControl.signal });
      } catch (err) {
        if (runControl.signal.aborted || isAgentRunCancelledError(err)) {
          await updateRun(store, taskId, {
            result: cancelReason(runControl.signal),
            status: "CANCELLED",
          }).catch((updateErr) => {
            logger.warn(
              { err: updateErr, taskId },
              "Failed to mark smoke task as cancelled",
            );
          });
          return;
        }
        throw err;
      } finally {
        runControl.unregister();
      }
      return;
    }

    let backend: ExecutionBackend | null = null;
    let sandbox: E2BSandboxLike | null = null;
    let runContext: AgentRunContext | null = null;

    try {
      runControl.throwIfCancelled();
      runContext = await loadRunContext(store, taskId);
      if (!runContext) throw new Error("Agent run not found");
      if (runContext.status === "CANCELLED") {
        logger.info(
          { taskId },
          "Skipping cancelled agent run before worker start",
        );
        return;
      }
      runControl.throwIfCancelled();
      await updateRun(store, taskId, { status: "RUNNING" });
      emitEvent({ type: "status_update", status: "RUNNING", taskId });

      const project = runContext.conversation?.project ?? null;
      const taskOverride =
        options.providerOverride ??
        normalizeProviderOverride(runContext.providerId) ??
        normalizeProviderOverride(project?.defaultProvider);
      const selectedBackend =
        options.backend ??
        normalizeBackend(runContext.backend ?? project?.defaultBackend);
      const localWorkspaceDir = localWorkspaceDirForProject(project, taskId);

      await providerRegistry.initialize();
      const modelOverride =
        runContext.modelName ?? project?.defaultModel ?? undefined;
      const activeModelOptions = {
        taskId,
        ...(modelOverride ? { modelOverride } : {}),
        ...(taskOverride ? { taskOverride } : {}),
      };
      const { model, provider } =
        await providerRegistry.getActiveModel(activeModelOptions);
      logger.info(
        { providerId: provider.id, model: provider.config.primaryModel },
        "Using provider for task",
      );
      logger.info(
        {
          backend: selectedBackend,
          conversationId: runContext.conversationId,
          modelName: modelOverride ?? provider.config.primaryModel,
          permissionMode: project?.permissionMode ?? null,
          projectDefaultBackend: project?.defaultBackend ?? null,
          projectId: project?.id ?? null,
          providerId: taskOverride ?? provider.id,
          taskId,
          workspaceDir:
            selectedBackend === "local" ? localWorkspaceDir : "/home/user",
          workspaceScope: project?.workspaceScope ?? null,
        },
        "Agent run runtime context selected",
      );
      await updateRun(store, taskId, {
        backend: selectedBackend,
        modelName: provider.config.primaryModel,
        providerId: provider.id,
      });
      await initializeTrajectory({ agentRunId: taskId, goal, store });
      const sharedMemoryNamespaceId = await ensureSharedMemoryNamespace({
        parentRunId: taskId,
        store,
      }).catch((err) => {
        logger.warn(
          { err, taskId },
          "Failed to initialize shared memory namespace",
        );
        return null;
      });
      runControl.throwIfCancelled();

      try {
        await withTimeout(
          (async () => {
            logger.info(
              {
                model: provider.config.primaryModel,
                providerId: provider.id,
                taskId,
              },
              "Creating active provider model for plan generation",
            );
            const planModel = await provider.createModel(undefined, {
              streaming: false,
            });
            logger.info(
              {
                model: provider.config.primaryModel,
                providerId: provider.id,
                taskId,
              },
              "Created active provider model for plan generation",
            );

            await emitPlan(taskId, goal, {
              llm: planModel,
              provider: {
                id: provider.id,
                model: provider.config.primaryModel,
              },
              signal: runControl.signal,
            });
          })(),
          PLAN_GENERATION_TIMEOUT_MS,
          "Plan generation",
        );
      } catch (err) {
        logger.error(
          {
            err,
            model: provider.config.primaryModel,
            providerId: provider.id,
            taskId,
            timeoutMs: PLAN_GENERATION_TIMEOUT_MS,
          },
          "Plan generation failed before agent execution",
        );
        throw err;
      }
      let criticContext = "";
      if (criticEnabled(project)) {
        const review = await runCriticReview({
          agentRunId: taskId,
          conversationId: runContext.conversationId,
          goal,
          interventionPoint: "post-plan-before-execute",
          llm: model,
          metadata: {
            backend: selectedBackend,
            model: provider.config.primaryModel,
            providerId: provider.id,
          },
          project,
          store,
        });
        emitEvent({
          content: `Critic ${review.verdict}: ${review.reasoning || "No concerns."}`,
          taskId,
          type: "thought",
        });
        if (review.verdict === "REJECT") {
          throw new CriticRejectedError(review);
        }
        criticContext = formatCriticFeedback(review);
      }
      runControl.throwIfCancelled();

      const shouldUseDesktopSandbox =
        selectedBackend === "e2b" && PHASE_3_DESKTOP_GOAL_PATTERN.test(goal);
      logger.info(
        { backend: selectedBackend, shouldUseDesktopSandbox, taskId },
        "Selecting task sandbox runtime",
      );
      if (selectedBackend === "local") {
        const localBackendOptions: LocalBackendOptions = {
          browserMode:
            project?.browserMode === "ACTUAL_CHROME"
              ? "actual-chrome"
              : await loadBrowserMode(store),
        };
        if (project?.customScopePath) {
          localBackendOptions.customScopePath = project.customScopePath;
        }
        if (project?.id) {
          localBackendOptions.projectId = project.id;
          localBackendOptions.workspaceDir = localWorkspaceDir;
        }
        if (project?.permissionMode) {
          localBackendOptions.permissionMode =
            project.permissionMode as NonNullable<
              LocalBackendOptions["permissionMode"]
            >;
        }
        if (project?.workspaceScope) {
          localBackendOptions.workspaceScope =
            project.workspaceScope as NonNullable<
              LocalBackendOptions["workspaceScope"]
            >;
        }
        backend = createLocalBackend(taskId, localBackendOptions);
        runControl.setBackend(backend);
        await backend.initialize(taskId);
        sandbox = localSandboxPlaceholder(taskId);
      } else if (shouldUseDesktopSandbox) {
        const desktopSandbox = (await createDesktopSandbox({
          resolution: [1280, 800],
        })) as unknown as E2BSandboxLike;
        const e2bBackend = createBackend({
          installCommonPackages: false,
          sandbox: desktopSandbox,
        });
        backend = e2bBackend;
        runControl.setBackend(backend);
        await e2bBackend.initialize(taskId);
        sandbox = e2bBackend.getSandbox();
      } else {
        const e2bBackend = createBackend();
        backend = e2bBackend;
        runControl.setBackend(backend);
        await e2bBackend.initialize(taskId);
        sandbox = e2bBackend.getSandbox();
      }
      if (!sandbox) throw new Error("Execution backend did not expose context");
      await updateRun(store, taskId, { sandboxId: sandbox.sandboxId });
      runControl.throwIfCancelled();

      const todoMd = await ensureTodoMd({
        backend,
        conversationId: runContext.conversationId,
        goal,
      }).catch((err) => {
        logger.warn(
          { err, taskId },
          "Failed to prepare todo.md; continuing without it",
        );
        return null;
      });
      if (todoMd) {
        await emitTodoMdFileEvent({
          backend,
          emitEvent,
          project,
          runContext,
          taskId,
          todo: todoMd,
        });
      }

      const trustedDomains = await loadTrustedDomains(store);
      let recalledMemory: MemoryFact[] = [];
      const memoryProjectForRun = normalizeMemoryProjectContext(project);
      const memoryEnabledForRun = currentMessageMemoryEnabled(runContext, goal);
      const memoryEnabledOverride =
        memoryEnabledForRun === null ? undefined : memoryEnabledForRun;
      try {
        recalledMemory = await getRelevantMemoryForTask({
          conversationId: runContext.conversationId,
          goal,
          ...(memoryEnabledOverride !== undefined
            ? { memoryEnabled: memoryEnabledOverride }
            : {}),
          project: memoryProjectForRun,
          taskId,
        });
        logger.info(
          {
            count: recalledMemory.length,
            memoryScope: project?.memoryScope ?? null,
            projectId: project?.id ?? null,
            taskId,
          },
          "Memory recall completed for agent run",
        );
        if (recalledMemory.length > 0) {
          emitEvent({
            facts: recalledMemory.map((fact) => ({
              content: fact.content,
              ...(fact.invalidAt ? { invalidAt: fact.invalidAt } : {}),
              source: fact.source,
              ...(typeof fact.score === "number" ? { score: fact.score } : {}),
              ...(fact.validAt ? { validAt: fact.validAt } : {}),
            })),
            taskId,
            timestamp: new Date().toISOString(),
            type: "memory_recall",
          });
        }
      } catch (err) {
        logger.warn(
          { err, taskId },
          "Memory recall failed; continuing without memory",
        );
      }
      await appendMessageToZep({
        content: goal,
        conversationId: runContext.conversationId,
        ...(memoryEnabledOverride !== undefined
          ? { memoryEnabled: memoryEnabledOverride }
          : {}),
        project: memoryProjectForRun,
        role: "USER",
      }).catch((err) => {
        logger.warn(
          {
            conversationId: runContext?.conversationId,
            err,
            projectId: project?.id ?? null,
            taskId,
          },
          "Failed to append current user message to memory after recall",
        );
      });
      const actionContext = await recentActionLogContext({
        conversationId: runContext.conversationId,
      }).catch((err) => {
        logger.warn(
          { conversationId: runContext?.conversationId, err, taskId },
          "Failed to load recent action log context; continuing without actions",
        );
        return "";
      });
      const proceduralContext = await findSimilarSuccessfulTrajectories({
        goal,
        projectId: project?.id ?? null,
        store,
      })
        .then(formatProceduralMemoryContext)
        .catch((err) => {
          logger.warn(
            { err, projectId: project?.id ?? null, taskId },
            "Procedural memory recall failed; continuing without procedural context",
          );
          return "";
        });
      const failureMemoryContext = await findSimilarFailedTrajectories({
        goal,
        projectId: project?.id ?? null,
        store,
      })
        .then(formatFailureMemoryContext)
        .catch((err) => {
          logger.warn(
            { err, projectId: project?.id ?? null, taskId },
            "Failure memory recall failed; continuing without failure context",
          );
          return "";
        });
      const resumeContext = await latestCheckpointContext({
        runId: taskId,
        store,
      }).catch((err) => {
        logger.warn(
          { err, taskId },
          "Failed to load resume checkpoint context; continuing without it",
        );
        return "";
      });
      const memoryContext = [
        formatMemoryContext(recalledMemory),
        proceduralContext,
        failureMemoryContext,
        resumeContext,
        formatTodoMdContext(todoMd),
        criticContext,
        actionContext,
      ]
        .filter((item) => item.trim().length > 0)
        .join("\n\n");

      if (selectedBackend === "e2b" && shouldRunDirectComputerUse(goal)) {
        logger.info(
          { taskId },
          "Routing task directly to Anthropic computer-use",
        );
        runControl.throwIfCancelled();
        const computerUseTool = createComputerUseTools()[0];
        if (!computerUseTool) {
          throw new Error("computer_use tool definition is unavailable");
        }
        const finalMessage = redactSecrets(
          await computerUseTool.implementation(
            { goal, maxIterations: 4 },
            { backend, sandbox, taskId, trustedDomains },
          ),
        );
        await recordTrajectoryStep({
          agentRunId: taskId,
          step: {
            completedAt: new Date().toISOString(),
            durationMs: 0,
            startedAt: new Date().toISOString(),
            status: "success",
            subgoal: "Use computer-use directly for desktop screenshot task",
            toolInput: { goal, maxIterations: 4 },
            toolName: "computer_use",
            toolOutput: finalMessage,
          },
          store,
        });
        runControl.throwIfCancelled();

        await createAssistantMessage(
          store,
          taskId,
          runContext,
          finalMessage,
          provider,
        );
        await updateRun(store, taskId, {
          result: finalMessage,
          status: "STOPPED",
        });
        if (store === prisma) {
          void notifyTaskEvent({
            agentRunId: taskId,
            eventType: "TASK_COMPLETED",
          }).catch((err) => {
            logger.warn({ err, taskId }, "Task completion notification failed");
          });
        }
        await completeTrajectory({
          agentRunId: taskId,
          outcome: "SUCCEEDED",
          store,
        });
        await synthesizeProceduralTemplatesForRun({
          projectId: project?.id ?? null,
          store,
          taskId,
        });
        emitEvent({
          type: "message",
          role: "assistant",
          content: finalMessage,
          taskId,
        });
        emitEvent({ type: "status_update", status: "STOPPED", taskId });
        return;
      }

      const memoryProject = memoryProjectForRun;
      let trajectoryStepCount = 0;
      const agentContext = {
        backend,
        ...(memoryProject && runContext.conversationId
          ? { conversationId: runContext.conversationId }
          : {}),
        ...(memoryEnabledOverride !== undefined
          ? { memoryEnabled: memoryEnabledOverride }
          : {}),
        ...(memoryContext ? { memoryContext } : {}),
        ...(memoryProject ? { memoryProject } : {}),
        ...(project?.id ? { projectId: project.id } : {}),
        ...(project?.permissionMode
          ? { projectPermissionMode: project.permissionMode }
          : {}),
        criticReviewToolResult: async (
          step: TrajectoryStepRecord,
          output: string,
        ) => {
          if (!shouldCriticReviewToolStep({ project, step })) return output;
          const interventionPoint =
            step.toolName === "file_write"
              ? "post-code-before-run"
              : "post-tool-result-before-next-step";
          const review = await runCriticReview({
            agentRunId: taskId,
            conversationId: runContext?.conversationId ?? taskId,
            goal,
            interventionPoint,
            llm: model,
            metadata: { step, output },
            project,
            store,
          });
          emitEvent({
            content: `Critic ${review.verdict}: ${review.reasoning || "No concerns."}`,
            taskId,
            type: "thought",
          });
          if (review.verdict === "REJECT")
            throw new CriticRejectedError(review);
          const feedback = formatCriticFeedback(review);
          return feedback ? `${output}\n\n${feedback}` : output;
        },
        recordTrajectoryStep: async (step: TrajectoryStepRecord) => {
          await recordTrajectoryStep({ agentRunId: taskId, step, store });
          trajectoryStepCount += 1;
          if (trajectoryStepCount % 5 === 0) {
            await createAgentRunCheckpoint({
              reason: `Automatic checkpoint after ${trajectoryStepCount} tool calls`,
              runId: taskId,
              store,
            });
          }
        },
        ...(sharedMemoryNamespaceId ? { sharedMemoryNamespaceId } : {}),
        taskId,
        sandbox,
        trustedDomains,
        ...(typeof runContext.userId === "string"
          ? { userId: runContext.userId }
          : {}),
      };
      const agent = await createAgent(agentContext, { llm: model });
      runControl.throwIfCancelled();
      const stream = await agent.streamEvents(
        {
          chat_history: conversationHistory(runContext, goal),
          input: redactSecrets(goal),
        },
        { signal: runControl.signal, version: "v2" },
      );
      let finalAnswer = "";

      for await (const event of stream) {
        runControl.throwIfCancelled();
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          const content = eventContentToString(chunk?.content);

          if (content) {
            const redacted = redactSecrets(content);
            emitEvent({ type: "thought", content: redacted, taskId });
            finalAnswer += redacted;
          }
        }

        if (event.event === "on_chain_end" && event.name === "AgentExecutor") {
          const output = getFinalOutput(event.data?.output);
          if (output) finalAnswer = redactSecrets(output);
        }
      }
      runControl.throwIfCancelled();

      const finalResult = parseAgentFinalResult(finalAnswer);
      const finalStatus = finalResult.success ? "STOPPED" : "ERROR";
      const finalMessage =
        finalResult.message ||
        (finalResult.success ? "Task completed." : "Task failed.");

      await createAssistantMessage(
        store,
        taskId,
        runContext,
        finalMessage,
        provider,
      );
      await updateRun(store, taskId, {
        result: finalMessage,
        status: finalStatus,
      });
      if (store === prisma) {
        void notifyTaskEvent({
          agentRunId: taskId,
          eventType:
            finalStatus === "STOPPED" ? "TASK_COMPLETED" : "TASK_FAILED",
          ...(finalResult.reason ? { detail: finalResult.reason } : {}),
        }).catch((err) => {
          logger.warn({ err, taskId }, "Task final notification failed");
        });
      }
      await completeTrajectory({
        agentRunId: taskId,
        outcome: trajectoryOutcomeFromStatus(finalStatus),
        ...(finalResult.reason ? { outcomeReason: finalResult.reason } : {}),
        store,
      });
      if (finalStatus === "STOPPED") {
        await synthesizeProceduralTemplatesForRun({
          projectId: project?.id ?? null,
          store,
          taskId,
        });
      }

      emitEvent({
        type: "message",
        role: "assistant",
        content: finalMessage,
        taskId,
      });
      if (!finalResult.success) {
        emitEvent({
          type: "error",
          message: finalResult.reason ?? "Agent reported task failure",
          taskId,
        });
      }
      emitEvent({
        type: "status_update",
        status: finalStatus,
        ...(finalResult.reason ? { detail: finalResult.reason } : {}),
        taskId,
      });
    } catch (err) {
      if (runControl.signal.aborted || isAgentRunCancelledError(err)) {
        if (isAgentRunPausedSignal(runControl.signal)) {
          const reason = pauseReason(runControl.signal);
          logger.info({ taskId }, "Agent run pause observed");
          await createAgentRunCheckpoint({ reason, runId: taskId, store });
          await updateRun(store, taskId, {
            result: reason,
            status: "PAUSED",
          }).catch((updateErr) => {
            logger.warn(
              { err: updateErr, taskId },
              "Failed to mark task as paused",
            );
          });
          emitEvent({
            type: "status_update",
            detail: reason,
            status: "PAUSED",
            taskId,
          });
          return;
        }

        const reason = cancelReason(runControl.signal);
        logger.info({ taskId }, "Agent run cancellation observed");

        await updateRun(store, taskId, {
          result: reason,
          status: "CANCELLED",
        }).catch((updateErr) => {
          logger.warn(
            { err: updateErr, taskId },
            "Failed to mark task as cancelled",
          );
        });
        await completeTrajectory({
          agentRunId: taskId,
          outcome: "CANCELLED",
          outcomeReason: reason,
          store,
        });
        if (store === prisma) {
          void notifyTaskEvent({
            agentRunId: taskId,
            detail: reason,
            eventType: "TASK_FAILED",
          }).catch((err) => {
            logger.warn(
              { err, taskId },
              "Task cancellation notification failed",
            );
          });
        }

        emitEvent({ type: "agent_run_cancelled", reason, taskId });
        emitEvent({
          type: "status_update",
          detail: reason,
          status: "CANCELLED",
          taskId,
        });
        return;
      }

      logger.error({ err, taskId }, "Agent run failed");

      const message = redactSecrets(
        err instanceof Error ? err.message : String(err),
      );

      if (isCriticRejectedError(err)) {
        await createAssistantMessage(store, taskId, runContext, message);
        await updateRun(store, taskId, {
          result: message,
          status: "ERROR",
        }).catch((updateErr) => {
          logger.warn(
            { err: updateErr, taskId },
            "Failed to mark critic-rejected task as errored",
          );
        });
        await completeTrajectory({
          agentRunId: taskId,
          outcome: "FAILED",
          outcomeReason: message,
          store,
        });
        if (store === prisma) {
          void notifyTaskEvent({
            agentRunId: taskId,
            detail: message,
            eventType: "CRITIC_FLAGGED",
          }).catch((notifyErr) => {
            logger.warn(
              { err: notifyErr, taskId },
              "Critic notification failed",
            );
          });
        }
        emitEvent({ type: "error", message, taskId });
        emitEvent({
          detail: message,
          status: "ERROR",
          taskId,
          type: "status_update",
        });
        return;
      }

      await updateRun(store, taskId, { status: "ERROR" }).catch((updateErr) => {
        logger.warn(
          { err: updateErr, taskId },
          "Failed to mark task as errored",
        );
      });
      const failureReason = failureReasonFromError(err);
      if (store === prisma) {
        void notifyTaskEvent({
          agentRunId: taskId,
          detail: failureReason ?? message,
          eventType: "TASK_FAILED",
        }).catch((notifyErr) => {
          logger.warn(
            { err: notifyErr, taskId },
            "Task failure notification failed",
          );
        });
      }
      await completeTrajectory({
        agentRunId: taskId,
        outcome: "FAILED",
        ...(failureReason ? { outcomeReason: failureReason } : {}),
        store,
      });

      emitEvent({ type: "error", message, taskId });
      emitEvent({ type: "status_update", status: "ERROR", taskId });
    } finally {
      if (backend) {
        await backend.shutdown(taskId).catch((err) => {
          logger.warn({ err, taskId }, "Failed to shut down execution backend");
        });
      }
      runControl.unregister();
    }
  };
}

export const runAgent = createAgentRunner();

async function synthesizeProceduralTemplatesForRun({
  projectId,
  store,
  taskId,
}: {
  projectId?: string | null;
  store: TrajectoryStore;
  taskId: string;
}) {
  await synthesizeTrajectoryTemplates({
    projectId: projectId ?? null,
    store,
  }).catch((err) => {
    logger.warn(
      { err, projectId: projectId ?? null, taskId },
      "Procedural template synthesis failed after successful run",
    );
  });
}
