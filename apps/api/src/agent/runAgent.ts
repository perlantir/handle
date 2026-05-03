import { E2BBackend, type E2BBackendOptions } from "../execution/e2bBackend";
import type { E2BSandboxLike, ExecutionBackend } from "../execution/types";
import { createBrowserDesktopSandbox } from "../execution/browserSession";
import { LocalBackend, type LocalBackendOptions } from "../execution/localBackend";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { homedir } from "node:os";
import { join } from "node:path";
import { emitTaskEvent } from "../lib/eventBus";
import { recentActionLogContext } from "../lib/actionLog";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import {
  appendMessageToZep,
  formatMemoryContext,
  getRelevantMemoryForTask,
  type MemoryFact,
} from "../memory/sessionMemory";
import { providerRegistry as defaultProviderRegistry } from "../providers/registry";
import {
  isProviderId,
  type ProviderId,
  type ProviderInstance,
} from "../providers/types";
import { createHandleAgent } from "./createAgent";
import { createComputerUseToolDefinitions } from "./computerUseTools";
import { parseAgentFinalResult } from "./finalResult";
import { emitInitialPlan } from "./plan";
import {
  beginAgentRun,
  cancelReason,
  isAgentRunCancelledError,
} from "./runControl";
import { isSmokeAgentEnabled, runSmokeAgent } from "./smokeAgent";

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
  message: {
    create(args: unknown): Promise<unknown>;
  };
  agentRun?: {
    findUnique(args: unknown): Promise<AgentRunContext | null>;
    update(args: unknown): Promise<unknown>;
  };
  task?: {
    findUnique(
      args: unknown,
    ): Promise<{ backend: string | null; providerOverride: string | null } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

interface ProjectContext {
  browserMode: string | null;
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
    messages?: Array<{ content: string; memoryEnabled?: boolean | null; role: string }>;
    project?: ProjectContext | null;
  } | null;
  providerId: string | null;
  modelName: string | null;
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
      memoryContext?: string;
      sandbox: E2BSandboxLike;
      taskId: string;
      trustedDomains?: string[];
    },
    options: { llm: BaseChatModel },
  ) => Promise<AgentLike>;
  createBackend?: (options?: E2BBackendOptions) => AgentExecutionBackend;
  createLocalBackend?: (taskId: string, options?: LocalBackendOptions) => ExecutionBackend;
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
  /\b(browser|browse|website|web page|webpage|navigate|url|https?:\/\/|click|selector|scroll|screenshot|screen|desktop|display|firefox|chrome|chromium|form|button|login|signin|checkout|payment)\b/i;
const DIRECT_COMPUTER_USE_GOAL_PATTERN =
  /\b(screenshot|screen|desktop|display)\b/i;
const BROWSER_GOAL_PATTERN =
  /\b(browser|browse|website|web page|webpage|navigate|url|https?:\/\/|click|selector|scroll|firefox|chrome|chromium|form|button|login|signin|checkout|payment)\b/i;

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
  status: "RUNNING" | "WAITING" | "STOPPED" | "ERROR" | "CANCELLED",
) {
  if (status === "STOPPED") return "COMPLETED";
  if (status === "ERROR") return "FAILED";
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

async function updateRun(store: TaskStore, taskId: string, data: Record<string, unknown>) {
  if (store.agentRun) {
    const nextData = { ...data };
    if (typeof nextData.status === "string") {
      nextData.status = runStatusToDb(
        nextData.status as
          | "RUNNING"
          | "WAITING"
          | "STOPPED"
          | "ERROR"
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

function conversationHistory(context: AgentRunContext | null, currentGoal: string) {
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

function normalizeMemoryProjectContext(project: ProjectContext | null | undefined) {
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

function defaultProjectWorkspaceDir(projectId: string | undefined, taskId: string) {
  return join(homedir(), "Documents", "Handle", "workspaces", projectId ?? taskId);
}

function localWorkspaceDirForProject(project: ProjectContext | null | undefined, taskId: string) {
  if (project?.workspaceScope === "CUSTOM_FOLDER" && project.customScopePath) {
    return project.customScopePath;
  }

  if (project?.workspaceScope === "DESKTOP") {
    return join(homedir(), "Desktop");
  }

  return defaultProjectWorkspaceDir(project?.id, taskId);
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
      emitEvent({ type: "status_update", status: "RUNNING", taskId });

      runContext = await loadRunContext(store, taskId);
      if (!runContext) throw new Error("Agent run not found");
      runControl.throwIfCancelled();

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
      const modelOverride = runContext.modelName ?? project?.defaultModel ?? undefined;
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
          workspaceDir: selectedBackend === "local" ? localWorkspaceDir : "/home/user",
          workspaceScope: project?.workspaceScope ?? null,
        },
        "Agent run runtime context selected",
      );
      await updateRun(store, taskId, {
        backend: selectedBackend,
        modelName: provider.config.primaryModel,
        providerId: provider.id,
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
            project.permissionMode as NonNullable<LocalBackendOptions["permissionMode"]>;
        }
        if (project?.workspaceScope) {
          localBackendOptions.workspaceScope =
            project.workspaceScope as NonNullable<LocalBackendOptions["workspaceScope"]>;
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

      const trustedDomains = await loadTrustedDomains(store);
      let recalledMemory: MemoryFact[] = [];
      try {
        recalledMemory = await getRelevantMemoryForTask({
          conversationId: runContext.conversationId,
          goal,
          memoryEnabled: currentMessageMemoryEnabled(runContext, goal),
          project: normalizeMemoryProjectContext(project),
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
        logger.warn({ err, taskId }, "Memory recall failed; continuing without memory");
      }
      const actionContext = await recentActionLogContext({
        conversationId: runContext.conversationId,
      }).catch((err) => {
        logger.warn(
          { conversationId: runContext?.conversationId, err, taskId },
          "Failed to load recent action log context; continuing without actions",
        );
        return "";
      });
      const memoryContext = [formatMemoryContext(recalledMemory), actionContext]
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
        runControl.throwIfCancelled();

        await createAssistantMessage(store, taskId, runContext, finalMessage, provider);
        await updateRun(store, taskId, {
          result: finalMessage,
          status: "STOPPED",
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

      const memoryProject = normalizeMemoryProjectContext(project);
      const agentContext = {
        backend,
        ...(memoryProject && runContext.conversationId
          ? { conversationId: runContext.conversationId }
          : {}),
        ...(memoryContext ? { memoryContext } : {}),
        ...(memoryProject ? { memoryProject } : {}),
        ...(project?.id ? { projectId: project.id } : {}),
        taskId,
        sandbox,
        trustedDomains,
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

      await createAssistantMessage(store, taskId, runContext, finalMessage, provider);
      await updateRun(store, taskId, {
        result: finalMessage,
        status: finalStatus,
      });

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

      await updateRun(store, taskId, { status: "ERROR" })
        .catch((updateErr) => {
          logger.warn(
            { err: updateErr, taskId },
            "Failed to mark task as errored",
          );
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
