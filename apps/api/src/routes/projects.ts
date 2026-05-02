import { Router } from "express";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
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
    .enum(["DEFAULT_WORKSPACE", "CUSTOM_FOLDER", "DESKTOP", "FULL_ACCESS"])
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

function expandHomePath(path: string) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

async function validateSpecificFolderPath(path: string) {
  const resolved = resolve(expandHomePath(path));
  if (!isAbsolute(resolved)) {
    return { error: "Specific folder path must be absolute", resolved };
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return { error: "Specific folder path must be an existing directory", resolved };
    }
  } catch (err) {
    logger.info({ err, path: resolved }, "Project custom folder validation failed");
    return { error: "Specific folder path does not exist", resolved };
  }

  return { resolved };
}

async function projectInputFromRequest(
  input: z.infer<typeof projectSchema>,
  options: { existingCustomScopePath?: string | null } = {},
) {
  const data = { ...input };
  const nextScope = data.workspaceScope;
  const candidatePath =
    data.customScopePath ?? options.existingCustomScopePath ?? null;

  if (nextScope === "CUSTOM_FOLDER") {
    if (!candidatePath) {
      return {
        error: "Specific folder path is required when workspace scope is Specific folder",
      };
    }

    const validation = await validateSpecificFolderPath(candidatePath);
    if (validation.error) {
      return {
        error: validation.error,
        resolvedPath: validation.resolved,
      };
    }
    data.customScopePath = validation.resolved;
  }

  if (nextScope === "DEFAULT_WORKSPACE" || nextScope === "DESKTOP" || nextScope === "FULL_ACCESS") {
    data.customScopePath = null;
  }

  return { data };
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

      const normalized = await projectInputFromRequest(parsed.data);
      if (normalized.error) {
        return res.status(400).json({
          error: normalized.error,
          ...(normalized.resolvedPath ? { path: normalized.resolvedPath } : {}),
        });
      }

      const project = await store.project.create({
        data: normalized.data,
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

      logger.info(
        {
          fields: Object.keys(parsed.data),
          projectId: req.params.projectId,
          workspaceScope: parsed.data.workspaceScope,
        },
        "Project update requested",
      );
      const current = await store.project.findUnique({
        where: { id: req.params.projectId },
      }) as { customScopePath?: string | null } | null;
      if (!current) {
        return res.status(404).json({ error: "Project not found" });
      }

      const normalized = await projectInputFromRequest(parsed.data, {
        existingCustomScopePath: current.customScopePath ?? null,
      });
      if (normalized.error) {
        logger.info(
          {
            error: normalized.error,
            path: normalized.resolvedPath,
            projectId: req.params.projectId,
            workspaceScope: parsed.data.workspaceScope,
          },
          "Project update rejected",
        );
        return res.status(400).json({
          error: normalized.error,
          ...(normalized.resolvedPath ? { path: normalized.resolvedPath } : {}),
        });
      }

      const project = await store.project.update({
        data: normalized.data,
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
