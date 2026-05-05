import type { MultiAgentTraceEvent } from "@handle/shared";
import type { AgentRunBudgets, BudgetSnapshot, MultiAgentProjectContext } from "./types";

export const DEFAULT_AGENT_RUN_BUDGETS: AgentRunBudgets = {
  maxCostCents: 200,
  maxParallelSubRuns: 3,
  maxRevisionLoops: 2,
  maxRuntimeSeconds: 1800,
  maxSpecialistSubRuns: 20,
  maxSupervisorTurns: 15,
  maxToolCalls: 100,
};

export const HARD_BUDGET_CEILINGS = {
  maxCostCents: 1000,
  maxRuntimeSeconds: 14_400,
};

export function budgetsFromProject(project?: MultiAgentProjectContext | null): AgentRunBudgets {
  return {
    maxCostCents: Math.min(project?.maxCostCents ?? DEFAULT_AGENT_RUN_BUDGETS.maxCostCents, HARD_BUDGET_CEILINGS.maxCostCents),
    maxParallelSubRuns: project?.maxParallelSubRuns ?? DEFAULT_AGENT_RUN_BUDGETS.maxParallelSubRuns,
    maxRevisionLoops: project?.maxRevisionLoops ?? DEFAULT_AGENT_RUN_BUDGETS.maxRevisionLoops,
    maxRuntimeSeconds: Math.min(
      project?.maxRuntimeSeconds ?? DEFAULT_AGENT_RUN_BUDGETS.maxRuntimeSeconds,
      HARD_BUDGET_CEILINGS.maxRuntimeSeconds,
    ),
    maxSpecialistSubRuns: project?.maxSpecialistSubRuns ?? DEFAULT_AGENT_RUN_BUDGETS.maxSpecialistSubRuns,
    maxSupervisorTurns: project?.maxSupervisorTurns ?? DEFAULT_AGENT_RUN_BUDGETS.maxSupervisorTurns,
    maxToolCalls: project?.maxToolCalls ?? DEFAULT_AGENT_RUN_BUDGETS.maxToolCalls,
  };
}

export function createBudgetSnapshot(project?: MultiAgentProjectContext | null): BudgetSnapshot {
  return {
    ...budgetsFromProject(project),
    costCents: 0,
    runtimeSeconds: 0,
    specialistSubRuns: 0,
    supervisorTurns: 0,
    toolCalls: 0,
    warningsEmitted: [],
  };
}

export function consumeBudget(
  snapshot: BudgetSnapshot,
  usage: Partial<Pick<BudgetSnapshot, "costCents" | "runtimeSeconds" | "specialistSubRuns" | "supervisorTurns" | "toolCalls">>,
) {
  return {
    ...snapshot,
    costCents: snapshot.costCents + (usage.costCents ?? 0),
    runtimeSeconds: snapshot.runtimeSeconds + (usage.runtimeSeconds ?? 0),
    specialistSubRuns: snapshot.specialistSubRuns + (usage.specialistSubRuns ?? 0),
    supervisorTurns: snapshot.supervisorTurns + (usage.supervisorTurns ?? 0),
    toolCalls: snapshot.toolCalls + (usage.toolCalls ?? 0),
  };
}

type BudgetDimension = "cost" | "runtime" | "specialists" | "supervisor_turns" | "tool_calls";

function dimensionUsage(snapshot: BudgetSnapshot): Array<{ current: number; key: BudgetDimension; limit: number }> {
  return [
    { current: snapshot.costCents, key: "cost", limit: snapshot.maxCostCents },
    { current: snapshot.runtimeSeconds, key: "runtime", limit: snapshot.maxRuntimeSeconds },
    { current: snapshot.specialistSubRuns, key: "specialists", limit: snapshot.maxSpecialistSubRuns },
    { current: snapshot.supervisorTurns, key: "supervisor_turns", limit: snapshot.maxSupervisorTurns },
    { current: snapshot.toolCalls, key: "tool_calls", limit: snapshot.maxToolCalls },
  ];
}

export function budgetWarnings(snapshot: BudgetSnapshot) {
  return dimensionUsage(snapshot)
    .filter((item) => item.limit > 0 && item.current / item.limit >= 0.8 && !snapshot.warningsEmitted.includes(item.key))
    .map((item) => item.key);
}

export function budgetExhausted(snapshot: BudgetSnapshot) {
  return dimensionUsage(snapshot).find((item) => item.limit > 0 && item.current >= item.limit) ?? null;
}

export function emitBudgetEvents({
  emitEvent,
  snapshot,
  taskId,
}: {
  emitEvent: (event: MultiAgentTraceEvent) => void;
  snapshot: BudgetSnapshot;
  taskId: string;
}) {
  for (const warning of budgetWarnings(snapshot)) {
    snapshot.warningsEmitted.push(warning);
    emitEvent({
      event: "budget_warning",
      metadata: { budget: snapshot, warning },
      summary: `Multi-agent run reached 80% of the ${warning} budget.`,
      taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
    });
  }

  const exhausted = budgetExhausted(snapshot);
  if (exhausted) {
    emitEvent({
      event: "budget_exhausted",
      metadata: { budget: snapshot, exhausted },
      summary: `Multi-agent run exhausted the ${exhausted.key} budget.`,
      taskId,
      timestamp: new Date().toISOString(),
      type: "multi_agent_trace",
    });
  }

  return exhausted;
}
