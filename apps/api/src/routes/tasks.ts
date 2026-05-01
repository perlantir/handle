import { Router } from "express";
import { z } from "zod";
import type { CreateTaskResponse } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

const createTaskSchema = z.object({
  goal: z.string().min(1).max(10_000),
  skipAgent: z.boolean().optional(),
});

export interface TaskRouteStore {
  user: {
    upsert(args: unknown): Promise<unknown>;
  };
  task: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
  };
}

interface CreateTasksRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  runAgent?: (taskId: string, goal: string) => Promise<void>;
  store?: TaskRouteStore;
}

function fallbackEmailForUserId(userId: string) {
  return `${encodeURIComponent(userId)}@handle.local`;
}

export function createTasksRouter({
  getUserId = getAuthenticatedUserId,
  runAgent = defaultRunAgent,
  store = prisma,
}: CreateTasksRouterOptions = {}) {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      await store.user.upsert({
        create: { email: fallbackEmailForUserId(userId), id: userId },
        update: {},
        where: { id: userId },
      });

      const task = await store.task.create({
        data: {
          goal: parsed.data.goal,
          messages: {
            create: { content: parsed.data.goal, role: "USER" },
          },
          userId,
        },
      });

      if (!parsed.data.skipAgent || process.env.NODE_ENV === "production") {
        runAgent(task.id, parsed.data.goal).catch((err) => {
          logger.error(
            { err, taskId: task.id },
            "runAgent unhandled rejection",
          );
        });
      }

      const response: CreateTaskResponse = { taskId: task.id };
      return res.json(response);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const task = await store.task.findFirst({
        include: { messages: { orderBy: { createdAt: "asc" } } },
        where: { id: req.params.id, userId },
      });

      if (!task) return res.status(404).json({ error: "Task not found" });

      return res.json(task);
    }),
  );

  return router;
}

export const tasksRouter = createTasksRouter();
