import { createE2BSandbox } from "../execution/e2bBackend";
import type { E2BSandboxLike } from "../execution/types";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { emitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { providerRegistry as defaultProviderRegistry } from "../providers/registry";
import { isProviderId, type ProviderId } from "../providers/types";
import { createPhase1Agent } from "./createAgent";
import { parseAgentFinalResult } from "./finalResult";
import { emitInitialPlan } from "./plan";
import { isSmokeAgentEnabled, runSmokeAgent } from "./smokeAgent";

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
  if (
    typeof output === "object" &&
    output &&
    "output" in output &&
    typeof output.output === "string"
  ) {
    return output.output;
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
    options: { version: "v2" },
  ): AsyncIterable<AgentStreamEvent>;
}

interface TaskStore {
  message: {
    create(args: unknown): Promise<unknown>;
  };
  task: {
    findUnique(
      args: unknown,
    ): Promise<{ providerOverride: string | null } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

interface ProviderRegistryLike {
  getActiveModel(args: {
    modelOverride?: string;
    taskId: string;
    taskOverride?: ProviderId;
  }): Promise<{
    model: BaseChatModel;
    provider: { config: { primaryModel: string }; id: ProviderId };
  }>;
  initialize(): Promise<void>;
}

interface RunAgentDependencies {
  createAgent?: (
    context: { sandbox: E2BSandboxLike; taskId: string },
    options: { llm: BaseChatModel },
  ) => Promise<AgentLike>;
  createSandbox?: typeof createE2BSandbox;
  emitEvent?: typeof emitTaskEvent;
  emitPlan?: typeof emitInitialPlan;
  isSmokeEnabled?: typeof isSmokeAgentEnabled;
  providerRegistry?: ProviderRegistryLike;
  runSmoke?: typeof runSmokeAgent;
  store?: TaskStore;
}

export interface RunAgentOptions {
  providerOverride?: ProviderId;
}

function normalizeProviderOverride(value: string | null | undefined) {
  if (!value) return undefined;
  return isProviderId(value) ? value : undefined;
}

export function createAgentRunner({
  createAgent = createPhase1Agent,
  createSandbox = createE2BSandbox,
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
    if (isSmokeEnabled()) {
      await runSmoke(taskId, goal);
      return;
    }

    let sandbox: E2BSandboxLike | null = null;

    try {
      emitEvent({ type: "status_update", status: "RUNNING", taskId });

      const task = await store.task.findUnique({
        select: { providerOverride: true },
        where: { id: taskId },
      });
      const taskOverride =
        options.providerOverride ??
        normalizeProviderOverride(task?.providerOverride);

      await emitPlan(taskId, goal);
      await providerRegistry.initialize();
      const activeModelOptions = taskOverride
        ? { taskId, taskOverride }
        : { taskId };
      const { model, provider } =
        await providerRegistry.getActiveModel(activeModelOptions);
      logger.info(
        { providerId: provider.id, model: provider.config.primaryModel },
        "Using provider for task",
      );

      sandbox = await createSandbox();
      await store.task.update({
        data: { sandboxId: sandbox.sandboxId },
        where: { id: taskId },
      });

      const agent = await createAgent({ taskId, sandbox }, { llm: model });
      const stream = await agent.streamEvents(
        { chat_history: [], input: redactSecrets(goal) },
        { version: "v2" },
      );
      let finalAnswer = "";

      for await (const event of stream) {
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

      const finalResult = parseAgentFinalResult(finalAnswer);
      const finalStatus = finalResult.success ? "STOPPED" : "ERROR";
      const finalMessage =
        finalResult.message ||
        (finalResult.success ? "Task completed." : "Task failed.");

      await store.message.create({
        data: { content: finalMessage, role: "ASSISTANT", taskId },
      });
      await store.task.update({
        data: { status: finalStatus },
        where: { id: taskId },
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
      logger.error({ err, taskId }, "Agent run failed");

      const message = redactSecrets(
        err instanceof Error ? err.message : String(err),
      );

      await store.task
        .update({ data: { status: "ERROR" }, where: { id: taskId } })
        .catch((updateErr) => {
          logger.warn(
            { err: updateErr, taskId },
            "Failed to mark task as errored",
          );
        });

      emitEvent({ type: "error", message, taskId });
      emitEvent({ type: "status_update", status: "ERROR", taskId });
    } finally {
      if (sandbox) {
        await sandbox.kill().catch((err) => {
          logger.warn({ err, taskId }, "Failed to kill E2B sandbox");
        });
      }
    }
  };
}

export const runAgent = createAgentRunner();
