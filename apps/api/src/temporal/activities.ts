import { runAgent } from "../agent/runAgent";
import { logger } from "../lib/logger";
import { isProviderId } from "../providers/types";
import type { AgentRunWorkflowInput } from "./constants";

export async function startAgentRunActivity(input: AgentRunWorkflowInput) {
  logger.info(
    {
      agentRunId: input.agentRunId,
      backend: input.options?.backend ?? null,
      providerOverride: input.options?.providerOverride ?? null,
    },
    "Temporal activity starting agent run",
  );

  await runAgent(input.agentRunId, input.goal, {
    ...(input.options?.backend ? { backend: input.options.backend } : {}),
    ...(input.options?.providerOverride &&
    isProviderId(input.options.providerOverride)
      ? { providerOverride: input.options.providerOverride }
      : {}),
  });

  return { agentRunId: input.agentRunId, completedAt: new Date().toISOString() };
}
