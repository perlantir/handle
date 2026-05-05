import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type {
  AgentExecutionMode,
  AgentSpecialistRole,
  CriticVerdict,
  MultiAgentTraceEvent,
} from "@handle/shared";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";

type EmitEvent = (event: MultiAgentTraceEvent) => void;

export interface MultiAgentProjectContext {
  agentExecutionMode?: string | null;
  criticEnabled?: boolean | null;
  criticScope?: string | null;
  id?: string | null;
  maxCostCents?: number | null;
  maxParallelSubRuns?: number | null;
  maxRevisionLoops?: number | null;
  maxRuntimeSeconds?: number | null;
  maxSpecialistSubRuns?: number | null;
  maxSupervisorTurns?: number | null;
  maxToolCalls?: number | null;
}

interface AgentSubRunDelegate {
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<unknown>;
}

interface AgentHandoffDelegate {
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<unknown>;
}

export interface MultiAgentStore {
  agentHandoff?: AgentHandoffDelegate;
  agentSubRun?: AgentSubRunDelegate;
}

interface SpecialistPlan {
  reason: string;
  roles: AgentSpecialistRole[];
  teamMode: boolean;
  verifierRequired: boolean;
}

export interface MultiAgentRunSummary {
  budget: {
    maxCostCents: number;
    maxParallelSubRuns: number;
    maxRevisionLoops: number;
    maxRuntimeSeconds: number;
    maxSpecialistSubRuns: number;
    maxSupervisorTurns: number;
    maxToolCalls: number;
  };
  primaryRole: AgentSpecialistRole;
  roles: AgentSpecialistRole[];
  teamMode: boolean;
  verifierRequired: boolean;
}

const roleLabels: Record<AgentSpecialistRole, string> = {
  ANALYST: "Analyst",
  CODER: "Coder",
  DESIGNER: "Designer",
  OPERATOR: "Operator",
  RESEARCHER: "Researcher",
  SUPERVISOR: "Supervisor",
  SYNTHESIZER: "Synthesizer",
  VERIFIER: "Verifier",
  WRITER: "Writer",
};

const defaultBudget = {
  maxCostCents: 200,
  maxParallelSubRuns: 3,
  maxRevisionLoops: 2,
  maxRuntimeSeconds: 1800,
  maxSpecialistSubRuns: 20,
  maxSupervisorTurns: 15,
  maxToolCalls: 100,
};

function asExecutionMode(value: string | null | undefined): AgentExecutionMode {
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
  return [...new Set(roles)];
}

function inferRoles(goal: string, mode: AgentExecutionMode): SpecialistPlan {
  const normalized = goal.toLowerCase();
  const roles: AgentSpecialistRole[] = [];
  let reason = "Supervisor selected the best specialist for this task.";

  if (mode === "RESEARCHER") roles.push("RESEARCHER");
  if (mode === "CODER") roles.push("CODER");
  if (mode === "DESIGNER") roles.push("DESIGNER");
  if (mode === "OPERATOR") roles.push("OPERATOR");
  if (mode === "WRITER") roles.push("WRITER");

  if (mode === "MULTI_AGENT_TEAM") {
    roles.push("RESEARCHER", "ANALYST", "WRITER", "VERIFIER");
    reason = "User explicitly selected multi-agent team mode.";
  }

  if (roles.length === 0) {
    if (/\b(research|compare|market|source|citation|news|company|competitor|synthesize)\b/.test(normalized)) {
      roles.push("RESEARCHER", "ANALYST");
    }
    if (/\b(code|pr|pull request|bug|test|typescript|python|review|implement|build|fix)\b/.test(normalized)) {
      roles.push("CODER");
    }
    if (/\b(design|ui|ux|screen|layout|component|visual|figma)\b/.test(normalized)) {
      roles.push("DESIGNER");
    }
    if (/\b(browser|click|navigate|gmail|slack|drive|notion|calendar|send|post|upload|download|workflow|integration)\b/.test(normalized)) {
      roles.push("OPERATOR");
    }
    if (/\b(write|draft|report|email|summary|brief|copy|proposal|document)\b/.test(normalized)) {
      roles.push("WRITER");
    }
  }

  if (roles.length === 0) roles.push("RESEARCHER");

  const hasMultiStepSignal =
    /\b(compare|synthesize|and then|then|after that|multi-step|research and|build and|draft and)\b/.test(normalized) ||
    uniqueRoles(roles).length > 1;
  const verifierRequired =
    /\b(research|citation|report|code review|pr|send|email|slack|browser|schedule|wide research|artifact)\b/.test(normalized) ||
    hasMultiStepSignal;

  if (hasMultiStepSignal && mode === "AUTO") {
    reason = "Task spans multiple specialist domains or contains multi-step synthesis language.";
  }

  return {
    reason,
    roles: uniqueRoles(roles),
    teamMode: mode === "MULTI_AGENT_TEAM" || (mode === "AUTO" && hasMultiStepSignal),
    verifierRequired,
  };
}

function budgetFromProject(project: MultiAgentProjectContext | null | undefined) {
  return {
    maxCostCents: project?.maxCostCents ?? defaultBudget.maxCostCents,
    maxParallelSubRuns: project?.maxParallelSubRuns ?? defaultBudget.maxParallelSubRuns,
    maxRevisionLoops: project?.maxRevisionLoops ?? defaultBudget.maxRevisionLoops,
    maxRuntimeSeconds: project?.maxRuntimeSeconds ?? defaultBudget.maxRuntimeSeconds,
    maxSpecialistSubRuns: project?.maxSpecialistSubRuns ?? defaultBudget.maxSpecialistSubRuns,
    maxSupervisorTurns: project?.maxSupervisorTurns ?? defaultBudget.maxSupervisorTurns,
    maxToolCalls: project?.maxToolCalls ?? defaultBudget.maxToolCalls,
  };
}

const MultiAgentGraphState = Annotation.Root({
  budget: Annotation<MultiAgentRunSummary["budget"]>(),
  goal: Annotation<string>(),
  mode: Annotation<AgentExecutionMode>(),
  plan: Annotation<SpecialistPlan | null>({
    default: () => null,
    reducer: (_left, right) => right,
  }),
});

function buildSupervisorGraph() {
  return new StateGraph(MultiAgentGraphState)
    .addNode("supervisor", async (state) => ({
      plan: inferRoles(state.goal, state.mode),
    }))
    .addEdge(START, "supervisor")
    .addEdge("supervisor", END)
    .compile();
}

async function safeCreateSubRun({
  agentRunId,
  goal,
  role,
  store,
}: {
  agentRunId: string;
  goal: string;
  role: AgentSpecialistRole;
  store: MultiAgentStore;
}) {
  if (!store.agentSubRun?.create) return null;
  return store.agentSubRun.create({
    data: {
      agentRunId,
      goal,
      inputs: { goal: redactSecrets(goal) },
      label: roleLabels[role],
      role,
      safeSummary: `${roleLabels[role]} assigned to this run.`,
      startedAt: new Date(),
      status: "RUNNING",
    },
  });
}

async function safeCompleteSubRun({
  id,
  role,
  store,
  summary,
  trace,
}: {
  id: string | null;
  role: AgentSpecialistRole;
  store: MultiAgentStore;
  summary: string;
  trace: unknown[];
}) {
  if (!id || !store.agentSubRun?.update) return;
  await store.agentSubRun.update({
    data: {
      completedAt: new Date(),
      outputs: { summary },
      role,
      safeSummary: summary,
      status: "COMPLETED",
      trace,
    },
    where: { id },
  });
}

async function safeCreateHandoff({
  agentRunId,
  fromRole,
  reason,
  store,
  toRole,
}: {
  agentRunId: string;
  fromRole: AgentSpecialistRole;
  reason: string;
  store: MultiAgentStore;
  toRole: AgentSpecialistRole;
}) {
  if (!store.agentHandoff?.create) return null;
  return store.agentHandoff.create({
    data: {
      agentRunId,
      fromRole,
      reason,
      status: "COMPLETED",
      toRole,
      completedAt: new Date(),
    },
  });
}

export async function initializeMultiAgentRun({
  emitEvent,
  goal,
  project,
  store,
  taskId,
}: {
  emitEvent: EmitEvent;
  goal: string;
  project?: MultiAgentProjectContext | null;
  store: MultiAgentStore;
  taskId: string;
}): Promise<MultiAgentRunSummary> {
  const mode = asExecutionMode(project?.agentExecutionMode);
  const budget = budgetFromProject(project);
  const graph = buildSupervisorGraph();
  const result = await graph.invoke({ budget, goal, mode, plan: null });
  const plan = result.plan ?? inferRoles(goal, mode);
  const primaryRole = plan.roles[0] ?? "RESEARCHER";
  const timestamp = new Date().toISOString();

  emitEvent({
    event: "supervisor_selected_specialist",
    metadata: { mode, roles: plan.roles },
    reason: plan.reason,
    role: primaryRole,
    summary: `Supervisor selected ${plan.roles.map((role) => roleLabels[role]).join(", ")}.`,
    taskId,
    timestamp,
    type: "multi_agent_trace",
  });

  if (plan.teamMode) {
    emitEvent({
      event: "auto_escalated_to_multi_agent",
      metadata: { mode, roles: plan.roles },
      reason: plan.reason,
      summary:
        mode === "MULTI_AGENT_TEAM"
          ? "Multi-agent team mode started from the beginning."
          : "Auto mode escalated this run to a multi-agent team.",
      taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
    });
  }

  for (const role of plan.roles) {
    const subRun = await safeCreateSubRun({ agentRunId: taskId, goal, role, store }).catch((err) => {
      logger.warn({ err, role, taskId }, "Failed to create specialist subrun");
      return null;
    });
    emitEvent({
      event: "specialist_started",
      role,
      summary: `${roleLabels[role]} started.`,
      taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
      ...(subRun?.id ? { subRunId: subRun.id } : {}),
    });
    const summary = `${roleLabels[role]} prepared context for the main agent execution.`;
    await safeCompleteSubRun({
      id: subRun?.id ?? null,
      role,
      store,
      summary,
      trace: [{ at: new Date().toISOString(), summary }],
    }).catch((err) => {
      logger.warn({ err, role, taskId }, "Failed to complete specialist subrun");
    });
    emitEvent({
      event: "specialist_completed",
      role,
      summary,
      taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
      ...(subRun?.id ? { subRunId: subRun.id } : {}),
    });
  }

  if (plan.roles.length > 1) {
    for (let index = 0; index < plan.roles.length - 1; index += 1) {
      const fromRole = plan.roles[index];
      const toRole = plan.roles[index + 1];
      if (!fromRole || !toRole) continue;
      const handoff = await safeCreateHandoff({
        agentRunId: taskId,
        fromRole,
        reason: "Sequential specialist context handoff for synthesis.",
        store,
        toRole,
      }).catch((err) => {
        logger.warn({ err, fromRole, taskId, toRole }, "Failed to create specialist handoff");
        return null;
      });
      emitEvent({
        event: "handoff_created",
        fromRole,
        summary: `${roleLabels[fromRole]} handed context to ${roleLabels[toRole]}.`,
        taskId,
        timestamp: new Date().toISOString(),
        toRole,
        type: "multi_agent_trace",
        ...(handoff?.id ? { handoffId: handoff.id } : {}),
      });
    }
  }

  return {
    budget,
    primaryRole,
    roles: plan.roles,
    teamMode: plan.teamMode,
    verifierRequired: plan.verifierRequired,
  };
}

export async function recordVerifierPass({
  emitEvent,
  store,
  summary,
  taskId,
  verdict = "APPROVE",
}: {
  emitEvent: EmitEvent;
  store: MultiAgentStore;
  summary: string;
  taskId: string;
  verdict?: CriticVerdict;
}) {
  const subRun = await safeCreateSubRun({
    agentRunId: taskId,
    goal: "Verify final output against the user request and safety policy.",
    role: "VERIFIER",
    store,
  }).catch((err) => {
    logger.warn({ err, taskId }, "Failed to create verifier subrun");
    return null;
  });
  emitEvent({
    event: "verification_started",
    role: "VERIFIER",
    summary: "Verifier started final output review.",
    taskId,
    timestamp: new Date().toISOString(),
    type: "multi_agent_trace",
    ...(subRun?.id ? { subRunId: subRun.id } : {}),
  });
  await safeCompleteSubRun({
    id: subRun?.id ?? null,
    role: "VERIFIER",
    store,
    summary,
    trace: [{ at: new Date().toISOString(), verdict, summary }],
  }).catch((err) => {
    logger.warn({ err, taskId }, "Failed to complete verifier subrun");
  });
  emitEvent({
    event: verdict === "APPROVE" ? "verification_passed" : "verification_revision_requested",
    role: "VERIFIER",
    summary,
    taskId,
    timestamp: new Date().toISOString(),
    type: "multi_agent_trace",
    verdict,
    ...(subRun?.id ? { subRunId: subRun.id } : {}),
  });
}
