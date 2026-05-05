import { Router } from "express";
import { z } from "zod";
import { cancelAgentRunById, type AgentRunCancelStore } from "../agent/cancelAgentRun";
import { pauseAgentRunById, type AgentRunPauseStore } from "../agent/pauseAgentRun";
import { resumeAgentRunById, type AgentRunResumeStore } from "../agent/resumeAgentRun";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { isProviderId, type ProviderId } from "../providers/types";
import { createAgentRun, getAgentRun, listAgentRuns, startAgentRun } from "../multiAgent/runner";

const cancelRunSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

const createAgentRunSchema = z.object({
  agentExecutionMode: z
    .enum(["AUTO", "RESEARCHER", "CODER", "DESIGNER", "OPERATOR", "WRITER", "MULTI_AGENT_TEAM"])
    .optional(),
  backend: z.enum(["e2b", "local"]).optional(),
  goal: z.string().min(1).max(10_000),
  providerOverride: z.string().refine(isProviderId).optional(),
});

interface AgentRunsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  runAgent?: (
    runId: string,
    goal: string,
    options?: { agentExecutionMode?: string; backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  // Router tests inject narrow stores for cancel/pause/resume, while production
  // uses Prisma's full client for list/create/detail endpoints.
  store?: any;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null;
}

function dbBackend(value: unknown) {
  return value === "LOCAL" ? "LOCAL" : "E2B";
}

function serializeSubRun(row: Record<string, unknown>) {
  return {
    agentRunId: String(row.agentRunId ?? ""),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt) ?? undefined,
    goal: String(row.goal ?? ""),
    id: String(row.id ?? ""),
    inputs: typeof row.inputs === "object" && row.inputs ? row.inputs as Record<string, unknown> : {},
    label: String(row.label ?? row.role ?? "Specialist"),
    outputs: typeof row.outputs === "object" && row.outputs ? row.outputs as Record<string, unknown> : {},
    role: String(row.role ?? "RESEARCHER"),
    safeSummary: String(row.safeSummary ?? ""),
    status: String(row.status ?? "QUEUED"),
    toolCallCount: typeof row.toolCallCount === "number" ? row.toolCallCount : 0,
    trace: Array.isArray(row.trace) ? row.trace : [],
    updatedAt: iso(row.updatedAt) ?? undefined,
  };
}

function serializeHandoff(row: Record<string, unknown>) {
  return {
    agentRunId: String(row.agentRunId ?? ""),
    artifactRefs: Array.isArray(row.artifactRefs) ? row.artifactRefs : [],
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt) ?? undefined,
    fromRole: String(row.fromRole ?? "SUPERVISOR"),
    fromSubRunId: typeof row.fromSubRunId === "string" ? row.fromSubRunId : null,
    id: String(row.id ?? ""),
    reason: String(row.reason ?? ""),
    status: String(row.status ?? "REQUESTED"),
    toRole: String(row.toRole ?? "RESEARCHER"),
    toSubRunId: typeof row.toSubRunId === "string" ? row.toSubRunId : null,
  };
}

function traceFromRun(run: Record<string, unknown>) {
  const subRuns = Array.isArray(run.subRuns) ? run.subRuns as Record<string, unknown>[] : [];
  const handoffs = Array.isArray(run.handoffs) ? run.handoffs as Record<string, unknown>[] : [];
  const taskId = String(run.id ?? "");
  return [
    ...subRuns.flatMap((subRun) => {
      const completed = subRun.status === "COMPLETED";
      const role = String(subRun.role ?? "RESEARCHER") as never;
      const timestamp = iso(completed ? subRun.completedAt : subRun.startedAt) ?? iso(subRun.createdAt) ?? new Date().toISOString();
      return [{
        event: role === "VERIFIER"
          ? completed ? "verification_passed" : "verification_started"
          : completed ? "specialist_completed" : "specialist_started",
        role,
        subRunId: String(subRun.id ?? ""),
        summary: String(subRun.safeSummary ?? `${role} ${completed ? "completed" : "started"}.`),
        taskId,
        timestamp,
        type: "multi_agent_trace",
      }];
    }),
    ...handoffs.map((handoff) => ({
      event: "handoff_created",
      fromRole: String(handoff.fromRole ?? "SUPERVISOR") as never,
      handoffId: String(handoff.id ?? ""),
      reason: String(handoff.reason ?? ""),
      summary: String(handoff.reason ?? "Specialist handoff created."),
      taskId,
      timestamp: iso(handoff.createdAt) ?? new Date().toISOString(),
      toRole: String(handoff.toRole ?? "RESEARCHER") as never,
      type: "multi_agent_trace" as const,
    })),
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function serializeRun(row: unknown) {
  const run = row as Record<string, unknown>;
  const conversation = run.conversation as Record<string, unknown> | undefined;
  const project = conversation?.project as Record<string, unknown> | undefined;
  const subRuns = Array.isArray(run.subRuns) ? run.subRuns.map((item) => serializeSubRun(item as Record<string, unknown>)) : [];
  const handoffs = Array.isArray(run.handoffs) ? run.handoffs.map((item) => serializeHandoff(item as Record<string, unknown>)) : [];
  return {
    asyncMode: Boolean(run.asyncMode),
    backend: dbBackend(run.backend),
    completedAt: iso(run.completedAt),
    conversationId: String(run.conversationId ?? ""),
    conversationTitle: typeof conversation?.title === "string" ? conversation.title : null,
    goal: String(run.goal ?? ""),
    handoffs,
    id: String(run.id ?? ""),
    lastHeartbeatAt: iso(run.lastHeartbeatAt),
    lastNotifiedAt: iso(run.lastNotifiedAt),
    modelName: typeof run.modelName === "string" ? run.modelName : null,
    projectId: typeof project?.id === "string" ? project.id : typeof conversation?.projectId === "string" ? conversation.projectId : null,
    projectName: typeof project?.name === "string" ? project.name : null,
    providerId: typeof run.providerId === "string" ? run.providerId : null,
    queuedAt: iso(run.queuedAt),
    result: typeof run.result === "string" ? run.result : null,
    startedAt: iso(run.startedAt) ?? undefined,
    status: String(run.status ?? "RUNNING"),
    subRuns,
    trace: traceFromRun({ ...run, handoffs, subRuns }),
    workflowId: typeof run.workflowId === "string" ? run.workflowId : null,
    workflowRunId: typeof run.workflowRunId === "string" ? run.workflowRunId : null,
    workflowStatus: typeof run.workflowStatus === "string" ? run.workflowStatus : null,
  };
}

export function createAgentRunsRouter({
  getUserId = getAuthenticatedUserId,
  runAgent = defaultRunAgent,
  store = prisma,
}: AgentRunsRouterOptions = {}) {
  const router = Router();

  router.get(
    "/agent-runs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runs = await listAgentRuns({ store, userId });
      return res.json({ runs: runs.map(serializeRun) });
    }),
  );

  router.post(
    "/agent-runs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = createAgentRunSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const run = await createAgentRun({
        ...(parsed.data.backend ? { backend: parsed.data.backend } : {}),
        goal: parsed.data.goal,
        ...(parsed.data.providerOverride ? { providerOverride: parsed.data.providerOverride } : {}),
        store,
        userId,
      });
      await startAgentRun({
        ...(parsed.data.agentExecutionMode ? { agentExecutionMode: parsed.data.agentExecutionMode } : {}),
        ...(parsed.data.backend ? { backend: parsed.data.backend } : {}),
        goal: parsed.data.goal,
        ...(parsed.data.providerOverride ? { providerOverride: parsed.data.providerOverride } : {}),
        runAgent,
        runId: run.id,
      });
      return res.status(201).json({ runId: run.id });
    }),
  );

  router.get(
    "/agent-runs/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });
      const run = await getAgentRun({ id: runId, store, userId });
      if (!run) return res.status(404).json({ error: "Agent run not found" });
      return res.json({ run: serializeRun(run) });
    }),
  );

  router.get(
    "/agent-runs/:id/subruns",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });
      const run = await getAgentRun({ id: runId, store, userId });
      if (!run) return res.status(404).json({ error: "Agent run not found" });
      return res.json({ subRuns: serializeRun(run).subRuns });
    }),
  );

  router.get(
    "/agent-runs/:id/handoffs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });
      const run = await getAgentRun({ id: runId, store, userId });
      if (!run) return res.status(404).json({ error: "Agent run not found" });
      return res.json({ handoffs: serializeRun(run).handoffs });
    }),
  );

  router.get(
    "/agent-runs/:id/trace",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });
      const run = await getAgentRun({ id: runId, store, userId });
      if (!run) return res.status(404).json({ error: "Agent run not found" });
      return res.json({ trace: serializeRun(run).trace });
    }),
  );

  router.get(
    "/tasks/:taskId/agent-run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.taskId;
      if (!runId) return res.status(400).json({ error: "Task id is required" });
      const run = await getAgentRun({ id: runId, store, userId });
      if (!run) return res.status(404).json({ error: "Agent run not found" });
      return res.json({ run: serializeRun(run) });
    }),
  );

  router.post(
    "/agent-runs/:id/cancel",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = cancelRunSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });

      const result = await cancelAgentRunById({
        reason: parsed.data.reason ?? "Cancelled by user",
        runId,
        store,
      });

      if (!result.found) {
        return res.status(404).json({ error: "Agent run not found" });
      }

      return res.json({
        active: result.active,
        cancelled: result.cancelled,
        status: result.status ?? "CANCELLED",
      });
    }),
  );

  router.post(
    "/agent-runs/:id/pause",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = cancelRunSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });

      const result = await pauseAgentRunById({
        reason: parsed.data.reason ?? "Paused by user",
        runId,
        store,
      });

      if (!result.found) {
        return res.status(404).json({ error: "Agent run not found" });
      }

      return res.json({
        active: result.active,
        paused: result.paused,
        status: result.status ?? "PAUSED",
      });
    }),
  );

  router.post(
    "/agent-runs/:id/resume",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Agent run id is required" });

      const result = await resumeAgentRunById({
        runAgent,
        runId,
        store,
      });

      if (!result.found) return res.status(404).json({ error: "Agent run not found" });
      if (!result.resumed) {
        return res.status(409).json({ error: `Agent run is ${result.status ?? "not paused"}` });
      }

      return res.json({ resumed: true, status: "RUNNING" });
    }),
  );

  return router;
}

export const agentRunsRouter = createAgentRunsRouter();
