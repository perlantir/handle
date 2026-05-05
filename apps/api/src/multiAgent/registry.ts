import type { AgentSpecialistRole } from "@handle/shared";
import type { SpecialistDefinition, SpecialistId } from "./types";

const readOnlyTools = ["memory.", "web_search", "web_fetch", "github.list", "github.get", "notion.search", "drive.search"];
const writeTools = ["file.", "gmail.", "slack.", "github.create", "github.comment", "notion.create", "drive.create"];

export const SPECIALIST_DEFINITIONS: Record<SpecialistId, SpecialistDefinition> = {
  analyst: {
    description: "Synthesis, comparisons, scoring, tradeoffs, and executive analysis.",
    id: "analyst",
    label: "Analyst",
    role: "ANALYST",
    runtimePolicy: { maxIterations: 4, maxToolCalls: 4, requiresVerifier: false },
    selectable: false,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["memory.", "web_fetch"],
      deniedToolPrefixes: writeTools,
      requiresApprovalFor: [],
    },
  },
  coder: {
    description: "Code review, implementation plans, tests, shell/file work, and GitHub PR analysis.",
    id: "coder",
    label: "Coder",
    role: "CODER",
    runtimePolicy: { maxIterations: 8, maxToolCalls: 18, requiresVerifier: true },
    selectable: true,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["file.", "shell.", "github.", "memory.", "web_search", "web_fetch"],
      deniedToolPrefixes: [],
      requiresApprovalFor: ["shell.exec:write", "file.delete", "github.create", "github.update"],
    },
  },
  designer: {
    description: "Visual critique, UI layout, design-system alignment, and UX recommendations.",
    id: "designer",
    label: "Designer",
    role: "DESIGNER",
    runtimePolicy: { maxIterations: 5, maxToolCalls: 8, requiresVerifier: false },
    selectable: true,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["file.read", "web_fetch", "memory."],
      deniedToolPrefixes: ["file.write", "shell.", "gmail.", "slack.", "github.create"],
      requiresApprovalFor: [],
    },
  },
  operator: {
    description: "Browser/computer operations, connector actions, and multi-step external workflows.",
    id: "operator",
    label: "Operator",
    role: "OPERATOR",
    runtimePolicy: { maxIterations: 8, maxToolCalls: 20, requiresVerifier: true },
    selectable: true,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["browser.", "computer_use", "gmail.", "slack.", "drive.", "notion.", "github.", "memory."],
      deniedToolPrefixes: [],
      requiresApprovalFor: ["gmail.send", "slack.send", "drive.create", "notion.create", "github.create", "computer_use:write"],
    },
  },
  researcher: {
    description: "Web research, source gathering, citation checks, and source-backed briefings.",
    id: "researcher",
    label: "Researcher",
    role: "RESEARCHER",
    runtimePolicy: { maxIterations: 8, maxToolCalls: 16, requiresVerifier: true },
    selectable: true,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: [...readOnlyTools, "memory."],
      deniedToolPrefixes: writeTools,
      requiresApprovalFor: [],
    },
  },
  supervisor: {
    description: "Planner/router that assigns work to the right specialists.",
    id: "supervisor",
    label: "Supervisor",
    role: "SUPERVISOR",
    runtimePolicy: { maxIterations: 3, maxToolCalls: 2, requiresVerifier: false },
    selectable: false,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["memory."],
      deniedToolPrefixes: [...writeTools, "shell.", "browser.", "computer_use"],
      requiresApprovalFor: [],
    },
  },
  synthesizer: {
    description: "Final response composer that combines specialist reports into a user-safe answer.",
    id: "synthesizer",
    label: "Synthesizer",
    role: "SYNTHESIZER",
    runtimePolicy: { maxIterations: 4, maxToolCalls: 4, requiresVerifier: false },
    selectable: false,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["memory."],
      deniedToolPrefixes: [...writeTools, "shell.", "browser.", "computer_use"],
      requiresApprovalFor: [],
    },
  },
  verifier: {
    description: "Quality, policy, citation, and approval gate verification.",
    id: "verifier",
    label: "Verifier",
    role: "VERIFIER",
    runtimePolicy: { maxIterations: 5, maxToolCalls: 8, requiresVerifier: false },
    selectable: false,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["web_fetch", "memory."],
      deniedToolPrefixes: writeTools,
      requiresApprovalFor: [],
    },
  },
  writer: {
    description: "Drafting, narrative structure, emails, reports, and final copy.",
    id: "writer",
    label: "Writer",
    role: "WRITER",
    runtimePolicy: { maxIterations: 5, maxToolCalls: 6, requiresVerifier: false },
    selectable: true,
    suggestedModel: "gpt-5.2",
    toolPolicy: {
      allowedToolPrefixes: ["memory.", "file.write:draft"],
      deniedToolPrefixes: ["gmail.send", "slack.send", "github.create", "drive.create"],
      requiresApprovalFor: ["file.write"],
    },
  },
};

export const SELECTABLE_SPECIALISTS = Object.values(SPECIALIST_DEFINITIONS).filter(
  (definition) => definition.selectable,
);

export function getSpecialistDefinition(id: SpecialistId) {
  return SPECIALIST_DEFINITIONS[id];
}

export function specialistIdFromRole(role: AgentSpecialistRole): SpecialistId {
  const found = Object.values(SPECIALIST_DEFINITIONS).find((definition) => definition.role === role);
  return found?.id ?? "researcher";
}

export function serializeSpecialistDefinition(definition: SpecialistDefinition) {
  return {
    description: definition.description,
    id: definition.id,
    label: definition.label,
    role: definition.role,
    runtimePolicy: definition.runtimePolicy,
    selectable: definition.selectable,
    ...(definition.suggestedModel ? { suggestedModel: definition.suggestedModel } : {}),
    toolPolicy: definition.toolPolicy,
  };
}
