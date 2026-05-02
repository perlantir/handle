import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { runAgent as defaultRunAgent } from "../agent/runAgent";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { isProviderId, type ProviderId } from "../providers/types";

const projectSchema = z.object({
  browserMode: z.enum(["SEPARATE_PROFILE", "ACTUAL_CHROME"]).optional(),
  customScopePath: z.string().min(1).nullable().optional(),
  defaultBackend: z.enum(["E2B", "LOCAL"]).optional(),
  defaultModel: z.string().min(1).nullable().optional(),
  defaultProvider: z.string().refine(isProviderId).nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  workspaceScope: z
    .enum(["DEFAULT_WORKSPACE", "CUSTOM_FOLDER", "FULL_ACCESS"])
    .optional(),
});

const createProjectSchema = projectSchema.extend({
  name: z.string().min(1).max(120),
});

const createConversationSchema = z.object({
  title: z.string().min(1).max(160).optional(),
});

const sendMessageSchema = z.object({
  backend: z.enum(["e2b", "local"]).optional(),
  content: z.string().min(1).max(10_000),
  modelName: z.string().min(1).max(200).optional(),
  providerId: z.string().refine(isProviderId).optional(),
});

export interface ProjectRouteStore {
  agentRun: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
  };
  conversation: {
    create(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  message: {
    create(args: unknown): Promise<{ id: string }>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  project: {
    create(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown | null>;
    update(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<unknown>;
  };
}

interface CreateProjectsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  runAgent?: (
    agentRunId: string,
    goal: string,
    options?: { backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>;
  store?: ProjectRouteStore;
}

function apiBackendToDb(value: "e2b" | "local" | undefined) {
  if (!value) return undefined;
  return value === "local" ? "LOCAL" : "E2B";
}

function dbBackendToApi(value: "E2B" | "LOCAL") {
  return value === "LOCAL" ? "local" : "e2b";
}

function titleFromContent(content: string) {
  return content.trim().slice(0, 80) || "New conversation";
}

async function ensureDefaultProject(store: ProjectRouteStore) {
  return store.project.upsert({
    create: {
      defaultBackend: "E2B",
      id: "default-project",
      name: "Personal",
    },
    update: {},
    where: { id: "default-project" },
  });
}

export function createProjectsRouter({
  getUserId = getAuthenticatedUserId,
  runAgent = defaultRunAgent,
  store = prisma,
}: CreateProjectsRouterOptions = {}) {
  const router = Router();

  router.get(
    "/projects",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await ensureDefaultProject(store);
      const projects = await store.project.findMany({
        orderBy: { createdAt: "asc" },
      });
      return res.json({ projects });
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const project = await store.project.create({
        data: parsed.data,
      });
      return res.status(201).json({ project });
    }),
  );

  router.put(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = projectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const project = await store.project.update({
        data: parsed.data,
        where: { id: req.params.projectId },
      });
      return res.json({ project });
    }),
  );

  router.delete(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await store.project.delete({ where: { id: req.params.projectId } });
      return res.status(204).end();
    }),
  );

  router.get(
    "/projects/:projectId/conversations",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const conversations = await store.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        where: { projectId: req.params.projectId },
      });
      return res.json({ conversations });
    }),
  );

  router.post(
    "/projects/:projectId/conversations",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createConversationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const conversation = await store.conversation.create({
        data: {
          projectId: req.params.projectId,
          ...(parsed.data.title ? { title: parsed.data.title } : {}),
        },
      });
      return res.status(201).json({ conversation });
    }),
  );

  router.get(
    "/conversations/:conversationId/messages",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const messages = await store.message.findMany({
        orderBy: { createdAt: "asc" },
        where: { conversationId: req.params.conversationId },
      });
      return res.json({ messages });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const conversation = await store.conversation.findFirst({
        include: { project: true },
        where: { id: req.params.conversationId },
      });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const message = await store.message.create({
        data: {
          content: parsed.data.content,
          conversationId: req.params.conversationId,
          role: "USER",
        },
      });

      const project = (conversation as { project?: { defaultBackend?: string } }).project;
      const backend = apiBackendToDb(parsed.data.backend) ?? project?.defaultBackend ?? "E2B";
      const run = await store.agentRun.create({
        data: {
          backend,
          conversationId: req.params.conversationId,
          goal: parsed.data.content,
          ...(parsed.data.modelName ? { modelName: parsed.data.modelName } : {}),
          ...(parsed.data.providerId ? { providerId: parsed.data.providerId } : {}),
          status: "RUNNING",
        },
      });

      const runOptions: { backend?: "e2b" | "local"; providerOverride?: ProviderId } = {
        backend: dbBackendToApi(backend as "E2B" | "LOCAL"),
      };
      if (parsed.data.providerId) {
        runOptions.providerOverride = parsed.data.providerId;
      }
      runAgent(run.id, parsed.data.content, runOptions).catch((err) => {
        logger.error({ conversationId: req.params.conversationId, err, runId: run.id }, "runAgent unhandled rejection");
      });

      return res.json({
        agentRunId: run.id,
        conversationId: req.params.conversationId,
        messageId: message.id,
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/stream",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).end();

      const run = await store.agentRun.findFirst({
        orderBy: { startedAt: "desc" },
        where: { conversationId: req.params.conversationId },
      });
      if (!run || typeof run !== "object" || !("id" in run)) {
        return res.status(404).end();
      }

      req.url = `/${String(run.id)}/stream`;
      return res.redirect(307, `/api/tasks/${String(run.id)}/stream`);
    }),
  );

  return router;
}

export const projectsRouter = createProjectsRouter();
