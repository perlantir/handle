import { runAgent } from "../agent/runAgent";
import { createAgentRun, startAgentRun } from "./runner";
import type { ProviderId } from "../providers/types";

export async function createAgentRunActivity(input: {
  backend?: "e2b" | "local";
  goal: string;
  providerOverride?: ProviderId;
  userId: string;
}) {
  return createAgentRun(input);
}

export async function startAgentRunActivity(input: {
  backend?: "e2b" | "local";
  goal: string;
  providerOverride?: ProviderId;
  runId: string;
}) {
  return startAgentRun({ ...input, runAgent });
}

export async function runSpecialistActivity(input: {
  agentRunId: string;
  goal: string;
  role: string;
}) {
  return {
    agentRunId: input.agentRunId,
    role: input.role,
    safeSummary: `Specialist activity accepted for ${input.role}: ${input.goal.slice(0, 160)}`,
  };
}
