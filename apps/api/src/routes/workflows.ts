import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import { runWorkflow } from "../workflows/workflowRuntime";

const actionSchema = z.object({
  connectorId: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  toolName: z.string().min(1),
});

const workflowSchema = z.object({
  actions: z.array(actionSchema).max(20).default([]),
  enabled: z.boolean().default(false),
  name: z.string().min(1).max(160),
  triggerConnectorId: z.string().min(1),
  triggerEventType: z.string().min(1).max(120),
  triggerFilter: z.record(z.unknown()).default({}),
});

const updateWorkflowSchema = workflowSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one workflow field is required.",
);

const runWorkflowSchema = z.object({
  eventPayload: z.record(z.unknown()).default({}),
});

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function workflowCreateData(userId: string, value: z.infer<typeof workflowSchema>) {
  return {
    actions: inputJson(value.actions),
    enabled: value.enabled,
    name: value.name,
    triggerConnectorId: value.triggerConnectorId,
    triggerEventType: value.triggerEventType,
    triggerFilter: inputJson(value.triggerFilter),
    userId,
  };
}

function workflowUpdateData(value: z.infer<typeof updateWorkflowSchema>) {
  const data: Record<string, unknown> = {};
  if (value.actions !== undefined) data.actions = inputJson(value.actions);
  if (value.enabled !== undefined) data.enabled = value.enabled;
  if (value.name !== undefined) data.name = value.name;
  if (value.triggerConnectorId !== undefined) data.triggerConnectorId = value.triggerConnectorId;
  if (value.triggerEventType !== undefined) data.triggerEventType = value.triggerEventType;
  if (value.triggerFilter !== undefined) data.triggerFilter = inputJson(value.triggerFilter);
  return data;
}

function workflowIdParam(value: string | undefined) {
  if (!value) throw new Error("Missing workflow id");
  return value;
}

export function createWorkflowsRouter({
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: {
  getUserId?: typeof getAuthenticatedUserId;
  store?: typeof prisma;
} = {}) {
  const router = Router();

  router.get(
    "/workflows",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const workflows = await store.workflow.findMany({
        orderBy: { updatedAt: "desc" },
        where: { userId },
      });
      return res.json({ workflows });
    }),
  );

  router.post(
    "/workflows",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = workflowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const workflow = await store.workflow.create({
        data: workflowCreateData(userId, parsed.data),
      });
      return res.status(201).json({ workflow });
    }),
  );

  router.put(
    "/workflows/:workflowId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = updateWorkflowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const workflowId = workflowIdParam(req.params.workflowId);
      const existing = await store.workflow.findFirst({
        where: { id: workflowId, userId },
      });
      if (!existing) return res.status(404).json({ error: "Workflow not found" });
      const workflow = await store.workflow.update({
        data: workflowUpdateData(parsed.data),
        where: { id: existing.id },
      });
      return res.json({ workflow });
    }),
  );

  router.delete(
    "/workflows/:workflowId",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const workflowId = workflowIdParam(req.params.workflowId);
      const existing = await store.workflow.findFirst({
        where: { id: workflowId, userId },
      });
      if (!existing) return res.status(404).json({ error: "Workflow not found" });
      await store.workflow.delete({ where: { id: existing.id } });
      return res.status(204).end();
    }),
  );

  router.post(
    "/workflows/:workflowId/run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = runWorkflowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const workflow = await store.workflow.findFirst({
        where: {
          id: workflowIdParam(req.params.workflowId),
          userId,
        },
      });
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      const result = await runWorkflow({
        eventPayload: parsed.data.eventPayload,
        store,
        workflow,
      });
      return res.json(result);
    }),
  );

  router.get(
    "/workflows/:workflowId/runs",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const workflow = await store.workflow.findFirst({
        where: {
          id: workflowIdParam(req.params.workflowId),
          userId,
        },
      });
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      const runs = await store.workflowRun.findMany({
        orderBy: { triggeredAt: "desc" },
        take: 50,
        where: { workflowId: workflow.id },
      });
      return res.json({ runs });
    }),
  );

  return router;
}

export const workflowsRouter = createWorkflowsRouter();
