import type { AgentExecutionMode, AgentSpecialistRole } from "@handle/shared";
import type { SpecialistAssignment, SpecialistId } from "./types";
import { specialistIdFromRole } from "./registry";

const selectableModeToRole: Partial<Record<AgentExecutionMode, AgentSpecialistRole>> = {
  CODER: "CODER",
  DESIGNER: "DESIGNER",
  OPERATOR: "OPERATOR",
  RESEARCHER: "RESEARCHER",
  WRITER: "WRITER",
};

export function normalizeExecutionMode(value: string | null | undefined): AgentExecutionMode {
  if (
    value === "RESEARCHER" ||
    value === "CODER" ||
    value === "DESIGNER" ||
    value === "OPERATOR" ||
    value === "WRITER" ||
    value === "MULTI_AGENT_TEAM"
  ) {
    return value;
  }
  return "AUTO";
}

function uniqueRoles(roles: AgentSpecialistRole[]) {
  return Array.from(new Set(roles));
}

export function inferSpecialistRoles(goal: string, mode: AgentExecutionMode): AgentSpecialistRole[] {
  if (mode === "MULTI_AGENT_TEAM") return ["RESEARCHER", "ANALYST", "WRITER", "VERIFIER"];
  const forced = selectableModeToRole[mode];
  if (forced) return [forced];

  const normalized = goal.toLowerCase();
  const roles: AgentSpecialistRole[] = [];

  if (/\b(research|compare|market|source|citation|news|company|competitor|synthesize|deep dive|find out)\b/.test(normalized)) {
    roles.push("RESEARCHER");
  }
  if (/\b(code|pr|pull request|bug|test|typescript|python|review|implement|build|fix|repo|github)\b/.test(normalized)) {
    roles.push("CODER");
  }
  if (/\b(design|ui|ux|screen|layout|component|visual|figma|brand)\b/.test(normalized)) {
    roles.push("DESIGNER");
  }
  if (/\b(browser|click|navigate|gmail|slack|drive|notion|calendar|send|post|upload|download|workflow|integration|website)\b/.test(normalized)) {
    roles.push("OPERATOR");
  }
  if (/\b(write|draft|report|email|summary|brief|copy|proposal|document|memo)\b/.test(normalized)) {
    roles.push("WRITER");
  }
  if (/\b(compare|score|rank|tradeoff|synthesize|analysis|recommend)\b/.test(normalized)) {
    roles.push("ANALYST");
  }

  if (roles.length === 0) roles.push("RESEARCHER");
  return uniqueRoles(roles);
}

export function shouldAutoEscalate(goal: string, mode: AgentExecutionMode, roles: AgentSpecialistRole[]) {
  if (mode === "MULTI_AGENT_TEAM") return true;
  if (mode !== "AUTO") return false;
  return (
    roles.length > 1 ||
    /\b(compare|synthesize|and then|then|after that|multi-step|research and|build and|draft and)\b/i.test(goal)
  );
}

export function verifierRequiredForGoal(goal: string, roles: AgentSpecialistRole[], mode: AgentExecutionMode) {
  if (roles.includes("VERIFIER")) return true;
  if (mode === "MULTI_AGENT_TEAM") return true;
  return (
    roles.some((role) => role === "RESEARCHER" || role === "CODER" || role === "OPERATOR") ||
    /\b(research|citation|report|code review|pr|send|email|slack|browser|schedule|wide research|artifact)\b/i.test(goal)
  );
}

export function createAssignments(goal: string, roles: AgentSpecialistRole[]): SpecialistAssignment[] {
  return roles.map((role, index) => {
    const specialistId: SpecialistId = specialistIdFromRole(role);
    return {
      goal: assignmentGoal(goal, role),
      id: `${specialistId}-${index + 1}`,
      rationale: rationaleForRole(role),
      role,
      specialistId,
    };
  });
}

function rationaleForRole(role: AgentSpecialistRole) {
  const map: Partial<Record<AgentSpecialistRole, string>> = {
    ANALYST: "The task needs synthesis, comparison, or scoring.",
    CODER: "The task contains code, repository, or implementation work.",
    DESIGNER: "The task contains visual, UI, or design-system work.",
    OPERATOR: "The task may need browser/computer or connector operations.",
    RESEARCHER: "The task needs source-backed research.",
    WRITER: "The task needs user-facing drafting or report composition.",
  };
  return map[role] ?? "Supervisor assigned this specialist based on task context.";
}

function assignmentGoal(goal: string, role: AgentSpecialistRole) {
  if (role === "RESEARCHER") return `Gather source-backed facts and citations for: ${goal}`;
  if (role === "ANALYST") return `Compare, synthesize, and score evidence for: ${goal}`;
  if (role === "WRITER") return `Draft the final user-facing artifact for: ${goal}`;
  if (role === "CODER") return `Analyze code or implementation aspects for: ${goal}`;
  if (role === "DESIGNER") return `Review design and UX implications for: ${goal}`;
  if (role === "OPERATOR") return `Plan or execute safe external operations for: ${goal}`;
  return goal;
}
