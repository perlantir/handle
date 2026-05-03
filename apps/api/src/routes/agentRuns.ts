import { Router } from "express";
import { z } from "zod";
import { cancelAgentRunById, type AgentRunCancelStore } from "../agent/cancelAgentRun";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";

const cancelRunSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

interface AgentRunsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  store?: AgentRunCancelStore;
}

export function createAgentRunsRouter({
  getUserId = getAuthenticatedUserId,
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

  return router;
}

export const agentRunsRouter = createAgentRunsRouter();
