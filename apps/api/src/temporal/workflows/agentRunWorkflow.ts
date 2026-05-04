import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities";
import type { AgentRunWorkflowInput, SkillRunWorkflowInput } from "../constants";

const { startAgentRunActivity } = proxyActivities<typeof activities>({
  retry: {
    initialInterval: "5 seconds",
    maximumAttempts: 1,
  },
  startToCloseTimeout: "24 hours",
});

const { startSkillRunActivity } = proxyActivities<typeof activities>({
  retry: {
    initialInterval: "5 seconds",
    maximumAttempts: 1,
  },
  startToCloseTimeout: "24 hours",
});

export async function agentRunWorkflow(input: AgentRunWorkflowInput) {
  return startAgentRunActivity(input);
}

export async function skillRunWorkflow(input: SkillRunWorkflowInput) {
  return startSkillRunActivity(input);
}
