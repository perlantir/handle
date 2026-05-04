import { Router } from "express";
import { z } from "zod";
import type { CreateTaskResponse } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { isProviderId, type ProviderId } from "../providers/types";

const createTaskSchema = z.object({
  backend: z.enum(["e2b", "local"]).optional(),
  goal: z.string().min(1).max(10_000),
  providerOverride: z.string().refine(isProviderId).optional(),
  skipAgent: z.boolean().optional(),
});

export interface TaskRouteStore {
  executionSettings?: {
    upsert(args: unknown): Promise<{ defaultBackend: string }>;
  };
  user: {
    upsert(args: unknown): Promise<unknown>;
  };
  agentRun?: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
  };
  conversation?: {
    create(args: unknown): Promise<{ id: string }>;
  };
  project?: {
    upsert(args: unknown): Promise<{ id: string }>;
  };
  task?: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
  };
}

interface CreateTasksRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  runAgent?: (
    taskId: string,
    goal: string,
    options?: { backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  store?: TaskRouteStore;
}

function fallbackEmailForUserId(userId: string) {
  return `${encodeURIComponent(userId)}@handle.local`;
}

async function defaultBackendForTask(store: TaskRouteStore) {
  if (!store.executionSettings) return "e2b" as const;

  const row = await store.executionSettings.upsert({
    create: {
      cleanupPolicy: "keep-all",
      defaultBackend: "e2b",
      id: "global",
    },
    update: {},
    where: { id: "global" },
  });

  return row.defaultBackend === "local" ? "local" : "e2b";
}

function backendToDb(value: "e2b" | "local") {
  return value === "local" ? "LOCAL" : "E2B";
}

function taskStatusFromRun(status: string | undefined) {
  if (status === "COMPLETED") return "STOPPED";
  if (status === "FAILED") return "ERROR";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "PAUSED") return "PAUSED";
  if (status === "WAITING") return "WAITING";
  return "RUNNING";
}

function backendFromRun(value: string | undefined) {
  return value === "LOCAL" || value === "local" ? "local" : "e2b";
}

function titleFromGoal(goal: string) {
  return goal.trim().slice(0, 80) || "New conversation";
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

      const backend = parsed.data.backend ?? (await defaultBackendForTask(store));

      let task: { id: string };

      if (store.agentRun && store.project && store.conversation) {
        const project = await store.project.upsert({
          create: {
            defaultBackend: backendToDb(backend),
            id: "default-project",
            name: "Personal",
          },
          update: {},
          where: { id: "default-project" },
        });
        const conversation = await store.conversation.create({
          data: {
            messages: {
              create: { content: parsed.data.goal, role: "USER" },
            },
            projectId: project.id,
            title: titleFromGoal(parsed.data.goal),
          },
        });
        task = await store.agentRun.create({
          data: {
            backend: backendToDb(backend),
            conversationId: conversation.id,
            goal: parsed.data.goal,
            ...(parsed.data.providerOverride
              ? { providerId: parsed.data.providerOverride }
              : {}),
            status: "RUNNING",
            userId,
          },
        });
      } else if (store.task) {
        task = await store.task.create({
          data: {
            backend,
            goal: parsed.data.goal,
            messages: {
              create: { content: parsed.data.goal, role: "USER" },
            },
            ...(parsed.data.providerOverride
              ? { providerOverride: parsed.data.providerOverride }
              : {}),
            userId,
          },
        });
      } else {
        throw new Error("Task route store is not configured");
      }

      if (!parsed.data.skipAgent || process.env.NODE_ENV === "production") {
        const runOptions = {
          backend,
          ...(parsed.data.providerOverride
            ? { providerOverride: parsed.data.providerOverride }
            : {}),
        };
        const runPromise = runAgent(task.id, parsed.data.goal, runOptions);

        runPromise.catch((err) => {
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

      const task =
        store.agentRun
          ? await store.agentRun.findFirst({
              include: {
                conversation: {
                  include: {
                    messages: { orderBy: { createdAt: "asc" } },
                    project: true,
                  },
                },
              },
              where: { id: req.params.id },
            })
          : store.task
            ? await store.task.findFirst({
                include: { messages: { orderBy: { createdAt: "asc" } } },
                where: { id: req.params.id, userId },
              })
            : null;

      if (!task) return res.status(404).json({ error: "Task not found" });

      if ("conversation" in (task as Record<string, unknown>)) {
        const run = task as {
          backend?: string;
          conversationId?: string;
          conversation?: {
            messages?: Array<{
              content: string;
              createdAt?: Date;
              id: string;
              role: string;
            }>;
            title?: string | null;
            project?: { id?: string; name?: string };
          };
          goal: string;
          id: string;
          modelName?: string | null;
          providerId?: string | null;
          status?: string;
          startedAt?: Date;
          updatedAt?: Date;
        };
        return res.json({
          backend: backendFromRun(run.backend),
          conversationId:
            "conversationId" in run ? (run as { conversationId?: string }).conversationId : undefined,
          createdAt: run.startedAt?.toISOString(),
          goal: run.goal,
          id: run.id,
          messages:
            run.conversation?.messages?.map((message) => ({
              content: message.content,
              createdAt: message.createdAt?.toISOString(),
              id: message.id,
              role: message.role,
            })) ?? [],
          conversationTitle: run.conversation && "title" in run.conversation
            ? (run.conversation as { title?: string | null }).title
            : null,
          providerId: run.providerId ?? null,
          providerModel: run.modelName ?? null,
          projectId:
            run.conversation &&
            "project" in run.conversation &&
            (run.conversation as { project?: { id?: string } }).project?.id,
          projectName:
            run.conversation &&
            "project" in run.conversation &&
            (run.conversation as { project?: { name?: string } }).project?.name,
          status: taskStatusFromRun(run.status),
          updatedAt: run.updatedAt?.toISOString(),
        });
      }

      return res.json(task);
    }),
  );

  return router;
}

export const tasksRouter = createTasksRouter();
