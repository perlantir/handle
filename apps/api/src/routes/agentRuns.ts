import { Router } from "express";
import { z } from "zod";
import { cancelAgentRunById, type AgentRunCancelStore } from "../agent/cancelAgentRun";
import { pauseAgentRunById, type AgentRunPauseStore } from "../agent/pauseAgentRun";
import { resumeAgentRunById, type AgentRunResumeStore } from "../agent/resumeAgentRun";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import type { ProviderId } from "../providers/types";

const cancelRunSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

interface AgentRunsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  runAgent?: (
    runId: string,
    goal: string,
    options?: { backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  store?: AgentRunCancelStore & AgentRunPauseStore & AgentRunResumeStore;
}

export function createAgentRunsRouter({
  getUserId = getAuthenticatedUserId,
  runAgent = defaultRunAgent,
  store = prisma,
}: AgentRunsRouterOptions = {}) {
  const router = Router();

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
