import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { dispatchAgentRun as defaultDispatchAgentRun } from "../temporal/dispatcher";

const savedAgentSchema = z.object({
  connectorAccess: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().default(true),
  memoryScope: z
    .enum(["GLOBAL_AND_PROJECT", "PROJECT_ONLY", "NONE"])
    .default("NONE"),
  name: z.string().min(1).max(160),
  outputTarget: z.record(z.unknown()).default({ type: "chat" }),
  prompt: z.string().min(1).max(20_000),
  schedule: z.string().min(1).nullable().optional(),
  trigger: z.enum(["manual", "schedule"]).default("manual"),
});

const updateSavedAgentSchema = savedAgentSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one saved agent field is required.",
  );

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createData(userId: string, value: z.infer<typeof savedAgentSchema>) {
  return {
    connectorAccess: value.connectorAccess,
    enabled: value.enabled,
    memoryScope: value.memoryScope,
    name: value.name,
    outputTarget: inputJson(value.outputTarget),
    prompt: value.prompt,
    schedule: value.schedule ?? null,
    trigger: value.trigger,
    userId,
  };
}

function updateData(value: z.infer<typeof updateSavedAgentSchema>) {
  const data: Record<string, unknown> = {};
  if (value.connectorAccess !== undefined)
    data.connectorAccess = value.connectorAccess;
  if (value.enabled !== undefined) data.enabled = value.enabled;
  if (value.memoryScope !== undefined) data.memoryScope = value.memoryScope;
  if (value.name !== undefined) data.name = value.name;
  if (value.outputTarget !== undefined)
    data.outputTarget = inputJson(value.outputTarget);
  if (value.prompt !== undefined) data.prompt = value.prompt;
  if (value.schedule !== undefined) data.schedule = value.schedule ?? null;
  if (value.trigger !== undefined) data.trigger = value.trigger;
  return data;
}

function agentIdParam(req: { params: { agentId?: string } }) {
  const { agentId } = req.params;
  if (!agentId) throw new Error("Missing saved agent id");
  return agentId;
}

function savedAgentRunStatusFromAgentRun(status: string | null | undefined) {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return null;
}

async function ensureDefaultProject(store: typeof prisma) {
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

async function syncInlineSavedAgentRun({
  agentRunId,
  savedAgentRunId,
  store,
}: {
  agentRunId: string;
  savedAgentRunId: string;
  store: typeof prisma;
}) {
  const run = await store.agentRun.findUnique({
    select: { completedAt: true, result: true, status: true },
    where: { id: agentRunId },
  });
  const status = savedAgentRunStatusFromAgentRun(run?.status);
  if (!run || !status) return;

  await store.savedAgentRun.update({
    data: {
      completedAt: run.completedAt ?? new Date(),
      error: status === "FAILED" ? (run.result ?? "Saved agent run failed") : null,
      status,
    },
    where: { id: savedAgentRunId },
  });
}

async function dispatchSavedAgentRunInBackground({
  agentRunId,
  dispatchAgentRun,
  goal,
  savedAgentRunId,
  store,
}: {
  agentRunId: string;
  dispatchAgentRun: typeof defaultDispatchAgentRun;
  goal: string;
  savedAgentRunId: string;
  store: typeof prisma;
}) {
  try {
    const result = await dispatchAgentRun(agentRunId, goal);
    if (result.mode === "inline") {
      await syncInlineSavedAgentRun({ agentRunId, savedAgentRunId, store });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.savedAgentRun.update({
      data: {
        completedAt: new Date(),
        error: message,
        status: "FAILED",
      },
      where: { id: savedAgentRunId },
    });
  }
}

export function createSavedAgentsRouter({
  dispatchAgentRun = defaultDispatchAgentRun,
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: {
  dispatchAgentRun?: typeof defaultDispatchAgentRun;
  getUserId?: typeof getAuthenticatedUserId;
  store?: typeof prisma;
} = {}) {
  const router = Router();

  router.get(
    "/saved-agents",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const agents = await store.savedAgent.findMany({
        orderBy: { updatedAt: "desc" },
        where: { userId },
      });
      res.json({ agents });
    }),
  );

  router.post(
    "/saved-agents",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = savedAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const agent = await store.savedAgent.create({
        data: createData(userId, parsed.data),
      });
      res.status(201).json({ agent });
    }),
  );

  router.put(
    "/saved-agents/:agentId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = updateSavedAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const agentId = agentIdParam(req);
      const existing = await store.savedAgent.findFirst({
        where: { id: agentId, userId },
      });
      if (!existing)
        return res.status(404).json({ error: "Saved agent not found" });
      const agent = await store.savedAgent.update({
        data: updateData(parsed.data),
        where: { id: existing.id },
      });
      res.json({ agent });
    }),
  );

  router.delete(
    "/saved-agents/:agentId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const agentId = agentIdParam(req);
      const existing = await store.savedAgent.findFirst({
        where: { id: agentId, userId },
      });
      if (!existing)
        return res.status(404).json({ error: "Saved agent not found" });
      await store.savedAgent.delete({ where: { id: existing.id } });
      res.status(204).end();
    }),
  );

  router.post(
    "/saved-agents/:agentId/run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const agentId = agentIdParam(req);
      const agent = await store.savedAgent.findFirst({
        where: { id: agentId, userId },
      });
      if (!agent)
        return res.status(404).json({ error: "Saved agent not found" });
      const project = await ensureDefaultProject(store);
      const conversation = await store.conversation.create({
        data: {
          projectId: project.id,
          title: `Saved agent: ${agent.name}`,
        },
      });
      await store.message.create({
        data: {
          content: agent.prompt,
          conversationId: conversation.id,
          memoryEnabled: agent.memoryScope !== "NONE",
          role: "USER",
        },
      });
      const run = await store.agentRun.create({
        data: {
          asyncMode: true,
          conversationId: conversation.id,
          goal: agent.prompt,
          status: "QUEUED",
          userId,
        },
      });
      const savedAgentRun = await store.savedAgentRun.create({
        data: {
          savedAgentId: agent.id,
          status: "QUEUED",
          taskRunId: run.id,
        },
      });
      await store.savedAgent.update({
        data: { lastRunAt: new Date() },
        where: { id: agent.id },
      });
      void dispatchSavedAgentRunInBackground({
        agentRunId: run.id,
        dispatchAgentRun,
        goal: agent.prompt,
        savedAgentRunId: savedAgentRun.id,
        store,
      });
      res.json({
        agentRunId: run.id,
        conversationId: conversation.id,
        savedAgentRunId: savedAgentRun.id,
        status: "QUEUED",
      });
    }),
  );

  return router;
}

export const savedAgentsRouter = createSavedAgentsRouter();
