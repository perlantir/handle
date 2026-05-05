import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentExecutionMode } from "@handle/shared";
import { redactSecrets } from "../lib/redact";
import type { MultiAgentRuntimeContext, SupervisorDecision } from "./types";
import { normalizeExecutionMode } from "./planner";
import { routeGoalToSpecialists } from "./router";

const SUPERVISOR_PROMPT = `You are Handle's multi-agent Supervisor.
Return concise routing JSON only:
{"reason":"...","preferredRoles":["RESEARCHER"],"verifierRequired":true}
Available roles: RESEARCHER, CODER, DESIGNER, OPERATOR, WRITER, ANALYST.
Use multiple roles only when the task needs distinct domains.`;

function parseRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) =>
      item === "RESEARCHER" ||
      item === "CODER" ||
      item === "DESIGNER" ||
      item === "OPERATOR" ||
      item === "WRITER" ||
      item === "ANALYST",
  );
}

export async function createSupervisorDecision({
  goal,
  project,
  providerRegistry,
  taskId,
}: Pick<MultiAgentRuntimeContext, "goal" | "project" | "providerRegistry" | "taskId">): Promise<SupervisorDecision> {
  const mode = normalizeExecutionMode(project?.agentExecutionMode);
  const deterministic = routeGoalToSpecialists(goal, mode);

  if (mode !== "AUTO") return deterministic;

  try {
    const { model } = await providerRegistry.getActiveModel({
      ...(project?.defaultModel ? { modelOverride: project.defaultModel } : {}),
      taskId,
    });
    const response = await model.invoke([
      new SystemMessage(SUPERVISOR_PROMPT),
      new HumanMessage(`Route this task: ${redactSecrets(goal)}`),
    ]);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) as Record<string, unknown> : {};
    const roles = parseRoles(parsed.preferredRoles);
    if (roles.length === 0) return deterministic;
    const routed = routeGoalToSpecialists(goal, mode);
    return {
      ...routed,
      assignments: routed.assignments.filter((assignment) => roles.includes(assignment.role)) || routed.assignments,
      reason: typeof parsed.reason === "string" ? parsed.reason : routed.reason,
      verifierRequired: typeof parsed.verifierRequired === "boolean" ? parsed.verifierRequired : routed.verifierRequired,
    };
  } catch {
    return deterministic;
  }
}
