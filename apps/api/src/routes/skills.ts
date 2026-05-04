import { Router } from "express";
import { z } from "zod";
import type { RunSkillRequest } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  getSkillForUser,
  listSkillsForUser,
  syncBuiltinSkills,
} from "../skills/skillRegistry";
import { runSkill } from "../skills/skillRunner";
import { serializeSkillRunDetail, serializeSkillRunSummary } from "../skills/serializer";

const runSkillSchema = z.object({
  backend: z.enum(["e2b", "local"]).optional(),
  conversationId: z.string().optional(),
  inputs: z.record(z.unknown()).default({}),
  memoryEnabled: z.boolean().optional(),
  modelName: z.string().optional(),
  projectId: z.string().optional(),
  providerId: z.string().optional(),
  trigger: z.enum(["MANUAL", "SCHEDULED", "WORKFLOW", "API", "SUGGESTED"]).optional(),
});

interface CreateSkillsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  store?: typeof prisma;
}

export function createSkillsRouter({
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: CreateSkillsRouterOptions = {}) {
  const router = Router();

  router.get(
    "/skills",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const skills = await listSkillsForUser({
        ...stringQuery("projectId", req.query.projectId),
        store,
        userId,
      });
      const category = typeof req.query.category === "string" ? req.query.category : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      return res.json({
        skills: skills.filter((skill) => {
          if (category && skill.category !== category) return false;
          if (q && !`${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(q)) return false;
          return true;
        }),
      });
    }),
  );

  router.get(
    "/skills/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const skill = await getSkillForUser({
        ...stringQuery("projectId", req.query.projectId),
        skillIdOrSlug: skillId,
        store,
        userId,
      });
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      return res.json({ skill });
    }),
  );

  router.post(
    "/skills/:id/run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = runSkillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const skillId = req.params.id;
      if (!skillId) return res.status(400).json({ error: "Missing skill id" });
      const run = await runSkill({
        request: JSON.parse(JSON.stringify(parsed.data)) as RunSkillRequest,
        skillIdOrSlug: skillId,
        store,
        userId,
      });
      return res.status(201).json({ run });
    }),
  );

  router.get(
    "/skill-runs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await syncBuiltinSkills(store);

      const rows = await store.skillRun.findMany({
        include: { artifacts: true, skill: true, steps: true },
        orderBy: { createdAt: "desc" },
        take: 100,
        where: {
          userId,
          ...(typeof req.query.skillId === "string" ? { skillId: req.query.skillId } : {}),
          ...(typeof req.query.projectId === "string" ? { projectId: req.query.projectId } : {}),
          ...(typeof req.query.status === "string" ? { status: req.query.status as never } : {}),
        },
      });
      return res.json({ runs: rows.map(serializeSkillRunSummary) });
    }),
  );

  router.get(
    "/skill-runs/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Missing run id" });
      const row = await store.skillRun.findFirst({
        include: {
          artifacts: { orderBy: { createdAt: "asc" } },
          skill: true,
          steps: { orderBy: { index: "asc" } },
        },
        where: { id: runId, userId },
      });
      if (!row) return res.status(404).json({ error: "Skill run not found" });
      return res.json({ run: serializeSkillRunDetail(row) });
    }),
  );

  router.get(
    "/skill-runs/:id/artifacts",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Missing run id" });
      const row = await store.skillRun.findFirst({
        include: {
          artifacts: { orderBy: { createdAt: "asc" } },
          skill: true,
          steps: { orderBy: { index: "asc" } },
        },
        where: { id: runId, userId },
      });
      if (!row) return res.status(404).json({ error: "Skill run not found" });
      return res.json({ artifacts: serializeSkillRunDetail(row).artifacts });
    }),
  );

  return router;
}

export const skillsRouter = createSkillsRouter();

function stringQuery(key: "projectId", value: unknown): { projectId?: string } {
  return typeof value === "string" ? { [key]: value } : {};
}
