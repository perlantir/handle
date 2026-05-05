import { Router } from "express";
import { z } from "zod";
import type { CreateScheduleRequest, UpdateScheduleRequest } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  archiveSchedule,
  backfillSchedule,
  createSchedule,
  getSchedule,
  getScheduleRun,
  listSchedules,
  previewNaturalSchedule,
  runScheduleNow,
  updateSchedule,
} from "../schedules/manager";
import { listScheduleTemplates, syncScheduleTemplates } from "../schedules/templates";

const targetTypeSchema = z.enum(["TASK", "SKILL", "SKILL_WORKFLOW", "WIDE_RESEARCH"]);
const overlapPolicySchema = z.enum(["SKIP", "BUFFER_ONE", "BUFFER_ALL", "CANCEL_OTHER", "TERMINATE_OTHER", "ALLOW_ALL"]);
const catchupPolicySchema = z.enum(["SKIP_MISSED", "RUN_LATEST", "RUN_ALL_WITH_LIMIT"]);
const statusSchema = z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "WAITING_FOR_APPROVAL", "WAITING_FOR_INTEGRATION", "ERROR"]);

const createScheduleSchema = z.object({
  approvalPolicy: z.record(z.unknown()).optional(),
  catchupPolicy: catchupPolicySchema.optional(),
  changeDetectionPolicy: z.record(z.unknown()).optional(),
  cronExpression: z.string().nullable().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  input: z.record(z.unknown()).default({}),
  name: z.string().min(1),
  naturalLanguage: z.string().optional(),
  notificationPolicy: z.record(z.unknown()).optional(),
  overlapPolicy: overlapPolicySchema.optional(),
  projectId: z.string().optional(),
  quotaPolicy: z.record(z.unknown()).optional(),
  runAt: z.string().nullable().optional(),
  targetRef: z.record(z.unknown()),
  targetType: targetTypeSchema,
  timezone: z.string().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial().extend({
  status: statusSchema.optional(),
});

const parseSchema = z.object({
  text: z.string().min(1),
  timezone: z.string().optional(),
});

const runSchema = z.object({
  mode: z.enum(["normal", "test"]).optional(),
});

const backfillSchema = z.object({
  from: z.string(),
  maxRuns: z.number().int().min(1).max(31).optional(),
  to: z.string(),
});

interface CreateSchedulesRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  store?: typeof prisma;
}

export function createSchedulesRouter({
  getUserId = getAuthenticatedUserId,
  store = prisma,
}: CreateSchedulesRouterOptions = {}) {
  const router = Router();

  router.get(
    "/schedule-templates",
    asyncHandler(async (_req, res) => {
      const templates = await listScheduleTemplates({ store });
      res.json({ templates });
    }),
  );

  router.post(
    "/schedule-templates/sync",
    asyncHandler(async (_req, res) => {
      const templates = await syncScheduleTemplates({ store });
      res.json({ templates });
    }),
  );

  router.post(
    "/schedules/parse",
    asyncHandler(async (req, res) => {
      const parsed = parseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid schedule text", details: parsed.error.flatten() });
      res.json({
        preview: previewNaturalSchedule({
          text: parsed.data.text,
          ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
        }),
      });
    }),
  );

  router.get(
    "/schedules",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const schedules = await listSchedules({ ...(projectId ? { projectId } : {}), store, userId });
      res.json({ schedules });
    }),
  );

  router.post(
    "/schedules",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = createScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid schedule", details: parsed.error.flatten() });
      const schedule = await createSchedule({
        input: jsonClone(parsed.data) as CreateScheduleRequest,
        store,
        userId,
      });
      res.status(201).json({ schedule });
    }),
  );

  router.get(
    "/schedules/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const schedule = await getSchedule({ scheduleId, store, userId });
      if (!schedule) return res.status(404).json({ error: "Schedule not found" });
      res.json({ schedule });
    }),
  );

  router.put(
    "/schedules/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = updateScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid schedule update", details: parsed.error.flatten() });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const schedule = await updateSchedule({
        input: jsonClone(parsed.data) as UpdateScheduleRequest,
        scheduleId,
        store,
        userId,
      });
      if (!schedule) return res.status(404).json({ error: "Schedule not found" });
      res.json({ schedule });
    }),
  );

  router.delete(
    "/schedules/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const schedule = await archiveSchedule({ scheduleId, store, userId });
      if (!schedule) return res.status(404).json({ error: "Schedule not found" });
      res.json({ schedule });
    }),
  );

  router.post(
    "/schedules/:id/run-now",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = runSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "Invalid run request", details: parsed.error.flatten() });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const run = await runScheduleNow({ mode: parsed.data.mode ?? "normal", scheduleId, store, userId });
      res.status(201).json({ run });
    }),
  );

  router.post(
    "/schedules/:id/test-run",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const run = await runScheduleNow({ mode: "test", scheduleId, store, userId });
      res.status(201).json({ run });
    }),
  );

  router.post(
    "/schedules/:id/backfill",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = backfillSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid backfill request", details: parsed.error.flatten() });
      const from = new Date(parsed.data.from);
      const to = new Date(parsed.data.to);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
        return res.status(400).json({ error: "Backfill dates are invalid" });
      }
      const scheduleId = req.params.id;
      if (!scheduleId) return res.status(400).json({ error: "Schedule id is required" });
      const runs = await backfillSchedule({
        from,
        ...(parsed.data.maxRuns ? { maxRuns: parsed.data.maxRuns } : {}),
        scheduleId,
        store,
        to,
        userId,
      });
      res.status(201).json({ runs });
    }),
  );

  router.get(
    "/schedule-runs/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params.id;
      if (!runId) return res.status(400).json({ error: "Schedule run id is required" });
      const run = await getScheduleRun({ runId, store, userId });
      if (!run) return res.status(404).json({ error: "Schedule run not found" });
      res.json({ run });
    }),
  );

  return router;
}

export const schedulesRouter = createSchedulesRouter();

function jsonClone(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
