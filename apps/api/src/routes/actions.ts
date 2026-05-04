import { Router } from "express";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { listActionLogEntries, undoActionLogEntry } from "../lib/actionLog";
import type { ActionOutcomeType } from "../lib/actionLog";

interface CreateActionsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
}

export function createActionsRouter({
  getUserId = getAuthenticatedUserId,
}: CreateActionsRouterOptions = {}) {
  const router = Router();

  router.get(
    "/actions",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const entries = (await listActionLogEntries()).filter((entry) => {
        if (typeof req.query.projectId === "string" && entry.projectId !== req.query.projectId) return false;
        if (typeof req.query.conversationId === "string" && entry.conversationId !== req.query.conversationId) return false;
        if (typeof req.query.outcomeType === "string" && entry.outcomeType !== req.query.outcomeType) return false;
        if (typeof req.query.q === "string" && req.query.q.trim()) {
          const needle = req.query.q.trim().toLowerCase();
          if (
            ![entry.description, entry.target, entry.outcomeType]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          ) {
            return false;
          }
        }
        if (typeof req.query.from === "string" && Date.parse(entry.timestamp) < Date.parse(req.query.from)) return false;
        if (typeof req.query.to === "string" && Date.parse(entry.timestamp) > Date.parse(req.query.to)) return false;
        return true;
      });
      return res.json({ actions: entries });
    }),
  );

  router.post(
    "/actions/:id/undo",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: "Missing action id" });
        const result = await undoActionLogEntry(id);
        return res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Undo failed";
        return res.status(400).json({ error: message });
      }
    }),
  );

  return router;
}

export const actionsRouter = createActionsRouter();

export type { ActionOutcomeType };
