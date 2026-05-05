import type { AgentExecutionMode } from "@handle/shared";
import type { SupervisorDecision } from "./types";
import {
  createAssignments,
  inferSpecialistRoles,
  shouldAutoEscalate,
  verifierRequiredForGoal,
} from "./planner";

export function routeGoalToSpecialists(goal: string, mode: AgentExecutionMode): SupervisorDecision {
  const inferredRoles = inferSpecialistRoles(goal, mode);
  const teamMode = shouldAutoEscalate(goal, mode, inferredRoles);
  const roles = teamMode
    ? inferredRoles.includes("WRITER")
      ? inferredRoles
      : [...inferredRoles, "WRITER" as const]
    : inferredRoles.slice(0, 1);

  return {
    assignments: createAssignments(goal, roles),
    mode,
    reason: teamMode
      ? "Task spans multiple specialist domains or contains multi-step language."
      : "Task fits a single best specialist.",
    verifierRequired: verifierRequiredForGoal(goal, roles, mode),
  };
}
