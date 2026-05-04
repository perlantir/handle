import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { isProviderId, type ProviderId } from "../providers/types";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import {
  createTemporalClient,
  loadTemporalSettings,
  type TemporalSettingsStore,
} from "./client";

interface AgentRunUpdateStore {
  agentRun?: {
    update(args: unknown): Promise<unknown>;
  };
}

export interface DispatchAgentRunDependencies {
  createClient?: typeof createTemporalClient;
  runAgent?: typeof defaultRunAgent;
  store?: AgentRunUpdateStore & TemporalSettingsStore;
}

export interface DispatchAgentRunOptions {
  backend?: "e2b" | "local";
  providerOverride?: ProviderId;
}

function workflowIdForRun(agentRunId: string) {
  return `handle-agent-run-${agentRunId}`;
}

function normalizeProviderOverride(value: string | undefined) {
  return value && isProviderId(value) ? value : undefined;
}

export function createAgentRunDispatcher({
  createClient = createTemporalClient,
  runAgent = defaultRunAgent,
  store = prisma,
}: DispatchAgentRunDependencies = {}) {
  return async function dispatchAgentRun(
    agentRunId: string,
    goal: string,
    options: DispatchAgentRunOptions = {},
  ) {
    const temporalSettings = await loadTemporalSettings(store);
    const providerOverride = normalizeProviderOverride(options.providerOverride);

    if (temporalSettings.enabled && store.agentRun) {
      const workflowId = workflowIdForRun(agentRunId);
      try {
        const client = await createClient(temporalSettings);
        const handle = await client.workflow.start("agentRunWorkflow", {
          args: [
            {
              agentRunId,
              goal,
              options: {
                ...(options.backend ? { backend: options.backend } : {}),
                ...(providerOverride ? { providerOverride } : {}),
              },
            },
          ],
          taskQueue: temporalSettings.taskQueue,
          workflowId,
        });
        await store.agentRun.update({
          data: {
            asyncMode: true,
            queuedAt: new Date(),
            status: "QUEUED",
            workflowId,
            workflowRunId:
              "firstExecutionRunId" in handle
                ? handle.firstExecutionRunId
                : null,
            workflowStatus: "queued",
          },
          where: { id: agentRunId },
        });
        logger.info(
          {
            agentRunId,
            taskQueue: temporalSettings.taskQueue,
            workflowId,
          },
          "Agent run queued on Temporal",
        );
        return { mode: "temporal" as const, workflowId };
      } catch (err) {
        logger.warn(
          {
            agentRunId,
            err,
            temporalAddress: temporalSettings.address,
            temporalNamespace: temporalSettings.namespace,
          },
          "Temporal queue unavailable; falling back to inline agent execution",
        );
        await store.agentRun.update({
          data: {
            asyncMode: false,
            workflowStatus: "fallback_inline",
          },
          where: { id: agentRunId },
        }).catch((updateErr) => {
          logger.warn(
            { agentRunId, err: updateErr },
            "Failed to mark agent run as inline fallback",
          );
        });
      }
    }

    await runAgent(agentRunId, goal, {
      ...(options.backend ? { backend: options.backend } : {}),
      ...(providerOverride ? { providerOverride } : {}),
    });
    return { mode: "inline" as const };
  };
}

export const dispatchAgentRun = createAgentRunDispatcher();
