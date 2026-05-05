import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AgentExecutionMode } from "@handle/shared";
import type { BudgetSnapshot, MultiAgentState, SpecialistAssignment, SpecialistReport, SupervisorDecision } from "./types";
import { routeGoalToSpecialists } from "./router";

export const MultiAgentGraphState = Annotation.Root({
  agentRunId: Annotation<string>(),
  approvalIds: Annotation<string[]>({ default: () => [], reducer: (_left, right) => right }),
  artifactIds: Annotation<string[]>({ default: () => [], reducer: (_left, right) => right }),
  assignments: Annotation<SpecialistAssignment[]>({ default: () => [], reducer: (_left, right) => right }),
  budgets: Annotation<BudgetSnapshot>(),
  completedReports: Annotation<SpecialistReport[]>({ default: () => [], reducer: (_left, right) => right }),
  currentGoal: Annotation<string>(),
  error: Annotation<string | undefined>({ default: () => undefined, reducer: (_left, right) => right }),
  mode: Annotation<AgentExecutionMode>(),
  originalGoal: Annotation<string>(),
  plan: Annotation<string[]>({ default: () => [], reducer: (_left, right) => right }),
  sourceIds: Annotation<string[]>({ default: () => [], reducer: (_left, right) => right }),
  status: Annotation<MultiAgentState["status"]>({ default: () => "planning", reducer: (_left, right) => right }),
  taskId: Annotation<string>(),
  traceEventIds: Annotation<string[]>({ default: () => [], reducer: (_left, right) => right }),
  userId: Annotation<string | null | undefined>({ default: () => undefined, reducer: (_left, right) => right }),
});

export function buildMultiAgentPlanningGraph() {
  return new StateGraph(MultiAgentGraphState)
    .addNode("supervisor", async (state) => {
      const decision = routeGoalToSpecialists(state.originalGoal, state.mode);
      return {
        assignments: decision.assignments,
        currentGoal: state.originalGoal,
        plan: decision.assignments.map((assignment) => `${assignment.role}: ${assignment.goal}`),
        status: "running" as const,
      };
    })
    .addEdge(START, "supervisor")
    .addEdge("supervisor", END)
    .compile();
}

export interface MultiAgentGraphCallbacks {
  decide?: (state: MultiAgentState) => Promise<SupervisorDecision> | SupervisorDecision;
  executeAssignments?: (state: MultiAgentState) => Promise<Partial<MultiAgentState>> | Partial<MultiAgentState>;
}

export function buildMultiAgentExecutionGraph(callbacks: MultiAgentGraphCallbacks) {
  return new StateGraph(MultiAgentGraphState)
    .addNode("supervisor", async (state) => {
      const decision = callbacks.decide
        ? await callbacks.decide(state as MultiAgentState)
        : routeGoalToSpecialists(state.originalGoal, state.mode);
      return {
        assignments: decision.assignments,
        currentGoal: state.originalGoal,
        plan: decision.assignments.map((assignment) => `${assignment.role}: ${assignment.goal}`),
        status: "running" as const,
      };
    })
    .addNode("specialists", async (state) => {
      if (!callbacks.executeAssignments) return { status: "running" as const };
      return callbacks.executeAssignments(state as MultiAgentState);
    })
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "specialists")
    .addEdge("specialists", END)
    .compile();
}
