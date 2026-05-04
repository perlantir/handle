import type { CreateSkillScheduleRequest, SkillScheduleSummary } from "@handle/shared";
import { ScheduleOverlapPolicy } from "@temporalio/client";
import type { Prisma } from "@prisma/client";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { createTemporalClient, loadTemporalSettings } from "../temporal/client";
import { DEFAULT_TEMPORAL_TASK_QUEUE } from "../temporal/constants";
import { runSkill } from "./skillRunner";

type SkillStore = typeof prisma;

export async function createSkillSchedule({
  input,
  store = prisma,
  userId,
}: {
  input: CreateSkillScheduleRequest;
  store?: SkillStore;
  userId: string;
}): Promise<SkillScheduleSummary> {
  const skill = await store.skill.findFirst({
    where: {
      id: input.skillId,
      archivedAt: null,
      enabled: true,
      OR: [
        { visibility: "BUILTIN" },
        { ownerUserId: userId, visibility: "PERSONAL" },
        ...(input.projectId ? [{ projectId: input.projectId, visibility: "PROJECT" as const }] : []),
      ],
    },
  });
  if (!skill) throw new Error("Skill not found for schedule");
  if (!input.cronExpression && !input.runAt) {
    throw new Error("Schedule requires a cronExpression or runAt");
  }

  const row = await store.skillSchedule.create({
    data: {
      cronExpression: input.cronExpression ?? null,
      enabled: input.enabled ?? false,
      inputs: jsonInput(input.inputs ?? {}),
      name: input.name,
      nextRunAt: input.runAt ? new Date(input.runAt) : null,
      projectId: input.projectId ?? null,
      runAt: input.runAt ? new Date(input.runAt) : null,
      skillId: input.skillId,
      timezone: input.timezone ?? "America/Chicago",
      userId,
    },
    include: { skill: true },
  });

  const temporalScheduleId = input.enabled
    ? await registerTemporalSchedule(row.id, {
      cronExpression: row.cronExpression,
      inputs: row.inputs as Record<string, unknown>,
        ...(row.projectId ? { projectId: row.projectId } : {}),
      runAt: row.runAt,
        skillId: row.skillId,
        timezone: row.timezone,
        userId,
      }).catch((err) => {
        logger.warn({ err, scheduleId: row.id }, "Temporal Skill schedule registration failed");
        return null;
      })
    : null;

  const updated = temporalScheduleId
    ? await store.skillSchedule.update({
        data: { temporalScheduleId },
        include: { skill: true },
        where: { id: row.id },
      })
    : row;
  return serializeSchedule(updated);
}

export async function listSkillSchedules({
  store = prisma,
  userId,
}: {
  store?: SkillStore;
  userId: string;
}) {
  const rows = await store.skillSchedule.findMany({
    include: { skill: true },
    orderBy: { createdAt: "desc" },
    where: { userId },
  });
  return rows.map(serializeSchedule);
}

export async function runSkillScheduleNow({
  scheduleId,
  store = prisma,
  userId,
}: {
  scheduleId: string;
  store?: SkillStore;
  userId: string;
}) {
  const schedule = await store.skillSchedule.findFirst({
    include: { skill: true },
    where: { id: scheduleId, userId },
  });
  if (!schedule) throw new Error("Skill schedule not found");
  const run = await runSkill({
    request: {
      inputs: schedule.inputs as Record<string, unknown>,
      ...(schedule.projectId ? { projectId: schedule.projectId } : {}),
      trigger: "SCHEDULED",
    },
    skillIdOrSlug: schedule.skillId,
    store,
    userId,
  });
  await store.skillSchedule.update({
    data: { lastRunAt: new Date() },
    where: { id: schedule.id },
  });
  return run;
}

async function registerTemporalSchedule(
  scheduleId: string,
  input: {
    cronExpression?: string | null;
    inputs: Record<string, unknown>;
    projectId?: string;
    runAt?: Date | null;
    skillId: string;
    timezone: string;
    userId: string;
  },
) {
  const settings = await loadTemporalSettings();
  if (!settings.enabled) return null;
  if (!input.cronExpression) return null;

  const client = await createTemporalClient(settings);
  const temporalScheduleId = `handle-skill-schedule-${scheduleId}`;
  await client.schedule.create({
    action: {
      args: [
        {
          inputs: input.inputs,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          scheduleId,
          skillId: input.skillId,
          trigger: "SCHEDULED",
          userId: input.userId,
        },
      ],
      taskQueue: settings.taskQueue || DEFAULT_TEMPORAL_TASK_QUEUE,
      type: "startWorkflow",
      workflowId: `${temporalScheduleId}-workflow`,
      workflowType: "skillRunWorkflow",
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
    scheduleId: temporalScheduleId,
    spec: {
      cronExpressions: [input.cronExpression],
      timezone: input.timezone,
    },
  });
  return temporalScheduleId;
}

function serializeSchedule(row: {
  createdAt?: Date;
  cronExpression?: string | null;
  enabled: boolean;
  id: string;
  inputs: unknown;
  lastRunAt?: Date | null;
  name: string;
  nextRunAt?: Date | null;
  projectId?: string | null;
  runAt?: Date | null;
  skill?: { name: string; slug: string } | null;
  skillId: string;
  temporalScheduleId?: string | null;
  timezone: string;
  updatedAt?: Date;
  userId?: string;
}): SkillScheduleSummary {
  return stripUndefined({
    createdAt: row.createdAt?.toISOString(),
    cronExpression: row.cronExpression ?? null,
    enabled: row.enabled,
    id: row.id,
    inputs: normalizeRecord(row.inputs),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    name: row.name,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    projectId: row.projectId ?? null,
    runAt: row.runAt?.toISOString() ?? null,
    skillId: row.skillId,
    ...(row.skill?.name ? { skillName: row.skill.name } : {}),
    ...(row.skill?.slug ? { skillSlug: row.skill.slug } : {}),
    temporalScheduleId: row.temporalScheduleId ?? null,
    timezone: row.timezone,
    updatedAt: row.updatedAt?.toISOString(),
    ...(row.userId ? { userId: row.userId } : {}),
  }) as SkillScheduleSummary;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
