import type { AgentSpecialistRole, CriticVerdict, MultiAgentTraceEvent } from "@handle/shared";
import { logger } from "../lib/logger";
import { providerRegistry as defaultProviderRegistry } from "../providers/registry";
import { createBudgetSnapshot } from "./budgets";
import { buildMultiAgentExecutionGraph } from "./graph";
import { createSpecialistHandoff } from "./handoffs";
import { normalizeExecutionMode } from "./planner";
import { SPECIALIST_DEFINITIONS } from "./registry";
import { resolveSpecialistContext } from "./specialists/common";
import { specialistExecutors } from "./specialists";
import { createSupervisorDecision } from "./supervisor";
import { synthesizeFinalResponse } from "./synthesizer";
import type {
  MultiAgentProjectContext,
  MultiAgentRunSummary,
  MultiAgentRuntimeContext,
  MultiAgentStore,
  SpecialistReport,
} from "./types";
import { shouldRunVerifier, runVerifier } from "./verifier";

type EmitEvent = (event: MultiAgentTraceEvent) => void;
export type { MultiAgentRunSummary } from "./types";

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

function rolesFromReports(reports: SpecialistReport[]) {
  return Array.from(new Set(reports.map((report) => report.role)));
}

function contextFromReports(reports: SpecialistReport[], synthesized: string) {
  if (reports.length === 0) return "";
  const specialistContext = reports
    .map((report) => {
      const sources = report.sources
        .map((source, index) => `${index + 1}. ${source.title} - ${source.url}`)
        .join("\n");
      const artifacts = report.artifacts
        .map((artifact) => `### ${artifact.title}\n${artifact.content}`)
        .join("\n\n");
      return [
        `## ${roleLabels[report.role]} specialist`,
        `Summary: ${report.safeSummary}`,
        `Findings:\n${report.findings.join("\n") || "None"}`,
        `Sources:\n${sources || "None"}`,
        artifacts,
      ].join("\n\n");
    })
    .join("\n\n");
  return [
    "<multi_agent_context>",
    synthesized ? `# Synthesized specialist context\n${synthesized}` : "",
    specialistContext,
    "</multi_agent_context>",
  ].filter(Boolean).join("\n\n");
}

function sourceRefsFromText(text: string) {
  const urls = Array.from(new Set(text.match(/https?:\/\/[^\s)]+/g) ?? []));
  const accessedAt = new Date().toISOString();
  return urls.slice(0, 20).map((url) => {
    let domain = "unknown";
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // Keep the raw URL visible in the source record even if parsing fails.
    }
    return {
      accessedAt,
      domain,
      title: domain,
      url,
    };
  });
}

export async function initializeMultiAgentRun({
  agentExecutionModeOverride,
  emitEvent,
  goal,
  modelOverride,
  project,
  providerRegistry = defaultProviderRegistry,
  store,
  taskId,
  userId,
}: {
  agentExecutionModeOverride?: string;
  emitEvent: EmitEvent;
  goal: string;
  modelOverride?: string;
  project?: MultiAgentProjectContext | null;
  providerRegistry?: MultiAgentRuntimeContext["providerRegistry"];
  store: MultiAgentStore;
  taskId: string;
  userId?: string | null;
}): Promise<MultiAgentRunSummary> {
  const mode = normalizeExecutionMode(agentExecutionModeOverride ?? project?.agentExecutionMode);
  const budget = createBudgetSnapshot(project);
  const runtime: MultiAgentRuntimeContext = {
    emitEvent,
    goal,
    ...(modelOverride ? { modelOverride } : {}),
    ...(project !== undefined ? { project } : {}),
    providerRegistry,
    store,
    taskId,
    ...(userId !== undefined ? { userId } : {}),
  };
  const reports: SpecialistReport[] = [];
  const graph = buildMultiAgentExecutionGraph({
    decide: async (state) => createSupervisorDecision({
      goal: state.originalGoal,
      ...(modelOverride ? { modelOverride } : {}),
      project: { ...(project ?? {}), agentExecutionMode: state.mode },
      providerRegistry,
      taskId,
    }),
    executeAssignments: async (state) => {
      const assignments = state.assignments;
      const roles = assignments.map((assignment) => assignment.role);
      const teamMode = state.mode === "MULTI_AGENT_TEAM" || roles.length > 1;
      const reason =
        roles.length > 1
          ? "Task spans multiple specialists or contains multi-step synthesis language."
          : "Supervisor selected the best specialist for this task.";

      emitEvent({
        event: "supervisor_selected_specialist",
        metadata: { assignments, mode: state.mode, roles },
        reason,
        role: roles[0] ?? "RESEARCHER",
        summary: `Supervisor selected ${roles.map((role) => roleLabels[role]).join(", ")}.`,
        taskId,
        timestamp: new Date().toISOString(),
        type: "multi_agent_trace",
      });

      if (teamMode) {
        emitEvent({
          event: "auto_escalated_to_multi_agent",
          metadata: { assignments, mode: state.mode, roles },
          reason,
          summary:
            state.mode === "MULTI_AGENT_TEAM"
              ? "Multi-agent team mode started from the beginning."
              : "Auto mode escalated this run to a multi-agent team.",
          taskId,
          timestamp: new Date().toISOString(),
          type: "multi_agent_trace",
        });
      }

      for (const assignment of assignments) {
        const definition = SPECIALIST_DEFINITIONS[assignment.specialistId];
        const executor =
          assignment.specialistId === "analyst" ||
          assignment.specialistId === "coder" ||
          assignment.specialistId === "designer" ||
          assignment.specialistId === "operator" ||
          assignment.specialistId === "researcher" ||
          assignment.specialistId === "verifier" ||
          assignment.specialistId === "writer"
            ? specialistExecutors[assignment.specialistId]
            : null;
        if (!definition || !executor) continue;
        try {
          const context = await resolveSpecialistContext(runtime, definition, budget);
          const extraContext = contextFromReports(reports, "");
          const report = await executor({ ...context, assignment }, extraContext);
          reports.push(report);
          const previous = reports.at(-2);
          if (previous) {
            await createSpecialistHandoff({
              agentRunId: taskId,
              artifactRefs: previous.artifactIds,
              emitEvent,
              fromRole: previous.role,
              reason: "Sequential specialist context handoff for synthesis.",
              store,
              toRole: report.role,
            }).catch((err) => {
              logger.warn({ err, fromRole: previous.role, taskId, toRole: report.role }, "Failed to record specialist handoff");
            });
          }
        } catch (err) {
          logger.warn({ err, role: assignment.role, taskId }, "Specialist execution failed");
          reports.push({
            artifactIds: [],
            artifacts: [],
            blockers: [err instanceof Error ? err.message : "Unknown specialist failure"],
            costCents: 0,
            findings: [],
            recommendations: [],
            role: assignment.role,
            safeSummary: `${roleLabels[assignment.role]} failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            sources: [],
            status: "failed",
            toolCallCount: 0,
          });
        }
      }

      return {
        artifactIds: reports.flatMap((report) => report.artifactIds),
        completedReports: reports,
        sourceIds: reports.flatMap((report) => report.sources.map((source) => source.url)),
        status: reports.some((report) => report.status === "failed") ? "failed" : "running",
      };
    },
  });
  const planned = await graph.invoke({
    agentRunId: taskId,
    approvalIds: [],
    artifactIds: [],
    assignments: [],
    budgets: budget,
    completedReports: [],
    currentGoal: goal,
    mode,
    originalGoal: goal,
    plan: [],
    sourceIds: [],
    status: "planning",
    taskId,
    traceEventIds: [],
    userId,
  });
  const assignments = planned.assignments;
  const roles = assignments.map((assignment) => assignment.role);
  const teamMode = mode === "MULTI_AGENT_TEAM" || roles.length > 1;
  const completedReports = planned.completedReports.length > 0 ? planned.completedReports : reports;

  const synthesized = await synthesizeFinalResponse({ reports: completedReports, runtime }).catch((err) => {
    logger.warn({ err, taskId }, "Multi-agent synthesis failed");
    return "";
  });

  const verifierRequired = shouldRunVerifier({ goal, reports: completedReports, verifierRequired: teamMode || project?.criticEnabled === true });

  const finalRoles = rolesFromReports(completedReports);

  return {
    budget,
    contextSummary: contextFromReports(completedReports, synthesized),
    ...(synthesized ? { finalResponse: synthesized } : {}),
    primaryRole: finalRoles[0] ?? roles[0] ?? "RESEARCHER",
    reports: completedReports,
    roles: finalRoles.length > 0 ? finalRoles : roles,
    teamMode,
    verifierRequired,
  };
}

export async function recordFinalVerifierReview({
  emitEvent,
  finalMessage,
  goal,
  modelOverride,
  project,
  providerRegistry = defaultProviderRegistry,
  store,
  taskId,
  userId,
}: {
  emitEvent: EmitEvent;
  finalMessage: string;
  goal: string;
  modelOverride?: string;
  project?: MultiAgentProjectContext | null;
  providerRegistry?: MultiAgentRuntimeContext["providerRegistry"];
  store: MultiAgentStore;
  taskId: string;
  userId?: string | null;
}) {
  const runtime: MultiAgentRuntimeContext = {
    emitEvent,
    goal,
    ...(modelOverride ? { modelOverride } : {}),
    ...(project !== undefined ? { project } : {}),
    providerRegistry,
    store,
    taskId,
    ...(userId !== undefined ? { userId } : {}),
  };
  const report: SpecialistReport = {
    artifactIds: [`${taskId}-final-response`],
    artifacts: [
      {
        content: finalMessage,
        kind: "analysis",
        mimeType: "text/markdown",
        title: "Final user response",
      },
    ],
    blockers: [],
    costCents: 0,
    findings: [finalMessage],
    recommendations: [],
    role: "SYNTHESIZER",
    safeSummary: "Final user-facing response ready for verifier review.",
    sources: sourceRefsFromText(finalMessage),
    status: "completed",
    toolCallCount: 0,
  };
  return runVerifier({
    budget: createBudgetSnapshot(project),
    reports: [report],
    runtime,
  });
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
  const subRun = await store.agentSubRun?.create({
    data: {
      agentRunId: taskId,
      goal: "Verify final output against the user request and safety policy.",
      inputs: {},
      label: "Verifier",
      role: "VERIFIER",
      safeSummary: "Verifier started final output review.",
      startedAt: new Date(),
      status: "RUNNING",
    },
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
  if (subRun?.id) {
    await store.agentSubRun?.update({
      data: {
        completedAt: new Date(),
        outputs: { summary, verdict },
        role: "VERIFIER",
        safeSummary: summary,
        status: verdict === "APPROVE" ? "COMPLETED" : "REVISED",
        trace: [{ at: new Date().toISOString(), summary, verdict }],
      },
      where: { id: subRun.id },
    });
  }
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
