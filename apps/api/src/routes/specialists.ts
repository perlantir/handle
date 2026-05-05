import { Router } from "express";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { SELECTABLE_SPECIALISTS, SPECIALIST_DEFINITIONS, serializeSpecialistDefinition } from "../multiAgent/registry";

export function createSpecialistsRouter({ getUserId = getAuthenticatedUserId } = {}) {
  const router = Router();

  router.get(
    "/specialists",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      return res.json({
        specialists: Object.values(SPECIALIST_DEFINITIONS).map(serializeSpecialistDefinition),
        selectable: SELECTABLE_SPECIALISTS.map(serializeSpecialistDefinition),
      });
    }),
  );

  router.get(
    "/specialists/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const specialist = Object.values(SPECIALIST_DEFINITIONS).find((candidate) => candidate.id === req.params.id);
      if (!specialist) return res.status(404).json({ error: "Specialist not found" });
      return res.json({ specialist: serializeSpecialistDefinition(specialist) });
    }),
  );

  return router;
}

export const specialistsRouter = createSpecialistsRouter();
