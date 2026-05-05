import type { CreateSkillScheduleRequest, SkillScheduleSummary } from "@handle/shared";
import { prisma } from "../lib/prisma";
import {
  createSchedule,
  listSchedules,
  runScheduleNow,
} from "../schedules/manager";
import { serializeSkillRunDetail } from "./serializer";

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
  if (!input.cronExpression && !input.runAt) {
    throw new Error("Schedule requires a cronExpression or runAt");
  }
  const schedule = await createSchedule({
    input: stripUndefined({
      cronExpression: input.cronExpression ?? null,
      enabled: input.enabled ?? false,
      input: input.inputs ?? {},
      name: input.name,
      projectId: input.projectId,
      runAt: input.runAt ?? null,
      targetRef: { skillId: input.skillId },
      targetType: "SKILL",
      timezone: input.timezone,
    }) as Parameters<typeof createSchedule>[0]["input"],
    store,
    userId,
  });
  return toSkillSchedule(schedule);
}

export async function listSkillSchedules({
  store = prisma,
  userId,
}: {
  store?: SkillStore;
  userId: string;
}) {
  const rows = await listSchedules({ store, userId });
  return rows.filter((row) => row.targetType === "SKILL").map(toSkillSchedule);
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
  const scheduled = await runScheduleNow({ scheduleId, store, userId });
  if (!scheduled.skillRunId) throw new Error(scheduled.errorMessage ?? "Scheduled Skill run did not produce a SkillRun");
  const row = await store.skillRun.findFirst({
    include: {
      artifacts: { orderBy: { createdAt: "asc" } },
      skill: true,
      steps: { orderBy: { index: "asc" } },
    },
    where: { id: scheduled.skillRunId, userId },
  });
  if (!row) throw new Error("Skill run not found");
  return serializeSkillRunDetail(row);
}

function toSkillSchedule(schedule: {
  createdAt?: string;
  cronExpression?: string | null;
  enabled: boolean;
  id: string;
  input: Record<string, unknown>;
  lastRunAt?: string | null;
  name: string;
  nextRunAt?: string | null;
  projectId?: string | null;
  runAt?: string | null;
  targetRef: Record<string, unknown>;
  temporalScheduleId?: string | null;
  timezone: string;
  updatedAt?: string;
  userId?: string;
}): SkillScheduleSummary {
  return stripUndefined({
    createdAt: schedule.createdAt,
    cronExpression: schedule.cronExpression ?? null,
    enabled: schedule.enabled,
    id: schedule.id,
    inputs: schedule.input,
    lastRunAt: schedule.lastRunAt ?? null,
    name: schedule.name,
    nextRunAt: schedule.nextRunAt ?? null,
    projectId: schedule.projectId ?? null,
    runAt: schedule.runAt ?? null,
    skillId: String(schedule.targetRef.skillId ?? schedule.targetRef.skillSlug ?? ""),
    temporalScheduleId: schedule.temporalScheduleId ?? null,
    timezone: schedule.timezone,
    updatedAt: schedule.updatedAt,
    userId: schedule.userId,
  }) as SkillScheduleSummary;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
