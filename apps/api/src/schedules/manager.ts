import type {
  CreateScheduleRequest,
  ScheduleRunSummary,
  ScheduleSummary,
  UpdateScheduleRequest,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { runAgent } from "../agent/runAgent";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { runSkill } from "../skills/skillRunner";
import { runSkillWorkflow } from "../skills/workflows";
import { DEFAULT_TEMPORAL_TASK_QUEUE } from "../temporal/constants";
import { createTemporalClient, loadTemporalSettings } from "../temporal/client";
import { appendScheduleAudit } from "./audit";
import { dispatchScheduleNotifications } from "./notifications";
import { parseNaturalSchedule } from "./parser";
import { nextRunPreview } from "./preview";
import { normalizeArray, normalizeRecord, serializeSchedule, serializeScheduleRun } from "./serializer";

type ScheduleStore = typeof prisma;
type RunMode = "normal" | "test" | "backfill";

export async function createSchedule({
  input,
  store = prisma,
  userId,
}: {
  input: CreateScheduleRequest;
  store?: ScheduleStore;
  userId: string;
}): Promise<ScheduleSummary> {
  const normalized = normalizeCreateInput(input);
  await validateTarget({ input: normalized, store, userId });
  const nextRuns = nextRunPreview({
    cronExpression: normalized.cronExpression,
    runAt: normalized.runAt ? new Date(normalized.runAt) : null,
    timezone: normalized.timezone,
  });

  const row = await store.schedule.create({
    data: {
      approvalPolicy: jsonInput(normalized.approvalPolicy ?? {}),
      catchupPolicy: normalized.catchupPolicy ?? "SKIP_MISSED",
      changeDetectionPolicy: jsonInput(normalized.changeDetectionPolicy ?? {}),
      cronExpression: normalized.cronExpression ?? null,
      description: normalized.description ? redactSecrets(normalized.description) : null,
      enabled: normalized.enabled ?? false,
      input: jsonInput(redactUnknown(normalized.input ?? {})),
      name: redactSecrets(normalized.name),
      naturalLanguage: normalized.naturalLanguage ? redactSecrets(normalized.naturalLanguage) : null,
      nextRunAt: nextRuns[0] ? new Date(nextRuns[0]) : null,
      notificationPolicy: jsonInput(normalized.notificationPolicy ?? {}),
      overlapPolicy: normalized.overlapPolicy ?? "SKIP",
      projectId: normalized.projectId ?? null,
      quotaPolicy: jsonInput(normalized.quotaPolicy ?? {}),
      runAt: normalized.runAt ? new Date(normalized.runAt) : null,
      status: normalized.enabled ? "ACTIVE" : "PAUSED",
      targetRef: jsonInput(redactUnknown(normalized.targetRef)),
      targetType: normalized.targetType,
      timezone: normalized.timezone,
      userId,
    },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const temporalScheduleId = row.enabled
    ? await registerTemporalSchedule({ schedule: row, store }).catch((err) => {
        logger.warn({ err, scheduleId: row.id }, "Temporal schedule registration failed");
        return null;
      })
    : null;
  const updated = temporalScheduleId
    ? await store.schedule.update({
        data: { temporalScheduleId },
        include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
        where: { id: row.id },
      })
    : row;

  await appendScheduleAudit({
    event: "schedule_created",
    projectId: updated.projectId,
    scheduleId: updated.id,
    status: updated.status,
    targetType: updated.targetType,
    userId,
  });
  return serializeSchedule(updated);
}

export async function listSchedules({
  projectId,
  store = prisma,
  userId,
}: {
  projectId?: string;
  store?: ScheduleStore;
  userId: string;
}) {
  const rows = await store.schedule.findMany({
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    where: {
      archivedAt: null,
      userId,
      ...(projectId ? { projectId } : {}),
    },
  });
  return rows.map(serializeSchedule);
}

export async function getSchedule({
  scheduleId,
  store = prisma,
  userId,
}: {
  scheduleId: string;
  store?: ScheduleStore;
  userId: string;
}) {
  const row = await store.schedule.findFirst({
    include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
    where: { id: scheduleId, userId },
  });
  return row ? serializeSchedule(row) : null;
}

export async function getScheduleRun({
  runId,
  store = prisma,
  userId,
}: {
  runId: string;
  store?: ScheduleStore;
  userId: string;
}) {
  const row = await store.scheduleRun.findFirst({
    include: { schedule: { include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    where: { id: runId, userId },
  });
  if (!row) return null;
  return {
    ...serializeScheduleRun(row),
    schedule: serializeSchedule(row.schedule),
  };
}

export async function updateSchedule({
  input,
  scheduleId,
  store = prisma,
  userId,
}: {
  input: UpdateScheduleRequest;
  scheduleId: string;
  store?: ScheduleStore;
  userId: string;
}) {
  const existing = await store.schedule.findFirst({ where: { id: scheduleId, userId } });
  if (!existing) return null;
  const base = stripUndefined({
    approvalPolicy: normalizeRecord(existing.approvalPolicy),
    catchupPolicy: existing.catchupPolicy as never,
    changeDetectionPolicy: normalizeRecord(existing.changeDetectionPolicy),
    cronExpression: existing.cronExpression,
    description: existing.description ?? undefined,
    enabled: input.enabled ?? existing.enabled,
    input: normalizeRecord(existing.input),
    name: existing.name,
    naturalLanguage: existing.naturalLanguage ?? undefined,
    notificationPolicy: normalizeRecord(existing.notificationPolicy),
    overlapPolicy: existing.overlapPolicy as never,
    projectId: existing.projectId ?? undefined,
    quotaPolicy: normalizeRecord(existing.quotaPolicy),
    runAt: existing.runAt?.toISOString() ?? null,
    targetRef: normalizeRecord(existing.targetRef),
    targetType: existing.targetType as never,
    timezone: existing.timezone,
    ...input,
  }) as CreateScheduleRequest;
  const merged = normalizeCreateInput(base);
  await validateTarget({ input: merged, store, userId });
  const nextRuns = nextRunPreview({
    cronExpression: merged.cronExpression,
    runAt: merged.runAt ? new Date(merged.runAt) : null,
    timezone: merged.timezone,
  });
  const enabled = input.enabled ?? (input.status ? input.status === "ACTIVE" : existing.enabled);
  const status = input.status ?? (enabled ? "ACTIVE" : "PAUSED");
  const row = await store.schedule.update({
    data: {
      approvalPolicy: jsonInput(merged.approvalPolicy ?? {}),
      catchupPolicy: merged.catchupPolicy ?? "SKIP_MISSED",
      changeDetectionPolicy: jsonInput(merged.changeDetectionPolicy ?? {}),
      cronExpression: merged.cronExpression ?? null,
      description: merged.description ? redactSecrets(merged.description) : null,
      enabled,
      input: jsonInput(redactUnknown(merged.input ?? {})),
      name: redactSecrets(merged.name),
      naturalLanguage: merged.naturalLanguage ? redactSecrets(merged.naturalLanguage) : null,
      nextRunAt: nextRuns[0] ? new Date(nextRuns[0]) : null,
      notificationPolicy: jsonInput(merged.notificationPolicy ?? {}),
      overlapPolicy: merged.overlapPolicy ?? "SKIP",
      projectId: merged.projectId ?? null,
      quotaPolicy: jsonInput(merged.quotaPolicy ?? {}),
      runAt: merged.runAt ? new Date(merged.runAt) : null,
      status,
      targetRef: jsonInput(redactUnknown(merged.targetRef)),
      targetType: merged.targetType,
      timezone: merged.timezone,
    },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    where: { id: scheduleId },
  });
  const temporalScheduleId = await reconcileTemporalSchedule({
    existing: {
      cronExpression: existing.cronExpression,
      temporalScheduleId: existing.temporalScheduleId,
      timezone: existing.timezone,
    },
    schedule: row,
    store,
  });
  const syncedRow = temporalScheduleId !== row.temporalScheduleId
    ? await store.schedule.update({
        data: { temporalScheduleId },
        include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
        where: { id: row.id },
      })
    : row;
  await appendScheduleAudit({
    event: enabled ? "schedule_enabled" : "schedule_disabled",
    projectId: syncedRow.projectId,
    scheduleId: syncedRow.id,
    status: syncedRow.status,
    targetType: syncedRow.targetType,
    userId,
  });
  await appendScheduleAudit({
    event: "schedule_updated",
    projectId: syncedRow.projectId,
    scheduleId: syncedRow.id,
    status: syncedRow.status,
    targetType: syncedRow.targetType,
    userId,
  });
  return serializeSchedule(syncedRow);
}

export async function archiveSchedule({
  scheduleId,
  store = prisma,
  userId,
}: {
  scheduleId: string;
  store?: ScheduleStore;
  userId: string;
}) {
  const row = await store.schedule.findFirst({ where: { id: scheduleId, userId } });
  if (!row) return null;
  const updated = await store.schedule.update({
    data: { archivedAt: new Date(), enabled: false, status: "ARCHIVED" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    where: { id: row.id },
  });
  await appendScheduleAudit({
    event: "schedule_deleted",
    projectId: updated.projectId,
    scheduleId: updated.id,
    status: updated.status,
    targetType: updated.targetType,
    userId,
  });
  return serializeSchedule(updated);
}

export async function runScheduleNow({
  mode = "normal",
  scheduleId,
  scheduledFor,
  store = prisma,
  userId,
}: {
  mode?: RunMode;
  scheduleId: string;
  scheduledFor?: Date;
  store?: ScheduleStore;
  userId: string;
}): Promise<ScheduleRunSummary> {
  const schedule = await store.schedule.findFirst({ where: { id: scheduleId, userId } });
  if (!schedule) throw new Error("Schedule not found");
  const overlap = await resolveOverlap({
    mode,
    schedule,
    ...(scheduledFor ? { scheduledFor } : {}),
    store,
    userId,
  });
  if (overlap) return overlap;
  const run = await store.scheduleRun.create({
    data: {
      input: jsonInput(normalizeRecord(schedule.input)),
      projectId: schedule.projectId,
      runMode: mode,
      scheduleId: schedule.id,
      scheduledFor: scheduledFor ?? schedule.nextRunAt ?? null,
      startedAt: new Date(),
      status: "RUNNING",
      userId,
    },
  });
  await appendScheduleAudit({
    event: "schedule_run_started",
    projectId: schedule.projectId,
    scheduleId: schedule.id,
    scheduleRunId: run.id,
    status: run.status,
    targetType: schedule.targetType,
    userId,
  });

  try {
    const healthChecks = await checkIntegrationHealth({ schedule, store, userId });
    const failingHealth = healthChecks.find((check) => check.status !== "ok");
    if (failingHealth) {
      const updated = await store.scheduleRun.update({
        data: {
          completedAt: new Date(),
          errorCode: "integration_unavailable",
          errorMessage: `${failingHealth.connectorId} is not connected.`,
          healthChecks: jsonInput(healthChecks),
          status: "WAITING_FOR_INTEGRATION",
        },
        where: { id: run.id },
      });
      await store.schedule.update({
        data: { status: "WAITING_FOR_INTEGRATION" },
        where: { id: schedule.id },
      });
      await appendScheduleAudit({
        event: "schedule_integration_wait",
        metadata: { connectorId: failingHealth.connectorId },
        projectId: schedule.projectId,
        scheduleId: schedule.id,
        scheduleRunId: run.id,
        status: updated.status,
        targetType: schedule.targetType,
        userId,
      });
      await dispatchScheduleNotifications({
        eventType: "SCHEDULE_INTEGRATION_WAIT",
        notificationPolicy: schedule.notificationPolicy,
        outputSummary: updated.errorMessage,
        projectId: schedule.projectId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleRunId: updated.id,
        status: updated.status,
        store,
        userId,
      });
      return serializeScheduleRun(updated);
    }

    const quota = await checkQuota({ schedule, store });
    if (!quota.allowed) {
      const updated = await store.scheduleRun.update({
        data: {
          completedAt: new Date(),
          errorCode: "quota_exceeded",
          errorMessage: quota.reason ?? "Schedule quota exceeded.",
          healthChecks: jsonInput(healthChecks),
          quotaSnapshot: jsonInput(quota.snapshot),
          status: "FAILED",
        },
        where: { id: run.id },
      });
      await appendScheduleAudit({
        event: "schedule_run_failed",
        metadata: { errorCode: "quota_exceeded" },
        projectId: schedule.projectId,
        scheduleId: schedule.id,
        scheduleRunId: run.id,
        status: updated.status,
        targetType: schedule.targetType,
        userId,
      });
      await dispatchScheduleNotifications({
        eventType: "SCHEDULE_RUN_FAILED",
        notificationPolicy: schedule.notificationPolicy,
        outputSummary: updated.errorMessage,
        projectId: schedule.projectId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleRunId: updated.id,
        status: updated.status,
        store,
        userId,
      });
      return serializeScheduleRun(updated);
    }

    const executed = await executeScheduleTarget({
      mode,
      runId: run.id,
      schedule,
      store,
      userId,
    });
    const status = mode === "test" ? "TEST_PASSED" : "COMPLETED";
    const updated = await store.scheduleRun.update({
      data: {
        ...executed,
        completedAt: new Date(),
        healthChecks: jsonInput(healthChecks),
        quotaSnapshot: jsonInput(quota.snapshot),
        status,
      },
      where: { id: run.id },
    });
    const nextRuns = nextRunPreview({
      cronExpression: schedule.cronExpression,
      runAt: schedule.runAt,
      timezone: schedule.timezone,
    });
    await store.schedule.update({
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRuns[0] ? new Date(nextRuns[0]) : null,
        status: schedule.enabled ? "ACTIVE" : "PAUSED",
      },
      where: { id: schedule.id },
    });
    await appendScheduleAudit({
      event: mode === "test" ? "schedule_test_run_completed" : "schedule_run_completed",
      projectId: schedule.projectId,
      scheduleId: schedule.id,
      scheduleRunId: run.id,
      status: updated.status,
      targetType: schedule.targetType,
      userId,
    });
    if (mode !== "test") {
      await dispatchScheduleNotifications({
        eventType: updated.changeDetected ? "SCHEDULE_CHANGE_DETECTED" : "SCHEDULE_RUN_COMPLETED",
        notificationPolicy: schedule.notificationPolicy,
        outputSummary: updated.outputSummary,
        projectId: schedule.projectId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleRunId: updated.id,
        status: updated.status,
        store,
        userId,
      });
    }
    return serializeScheduleRun(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Schedule run failed";
    const updated = await store.scheduleRun.update({
      data: {
        completedAt: new Date(),
        errorCode: "schedule_run_failed",
        errorMessage: redactSecrets(message),
        status: "FAILED",
      },
      where: { id: run.id },
    });
    await appendScheduleAudit({
      event: "schedule_run_failed",
      metadata: { error: message },
      projectId: schedule.projectId,
      scheduleId: schedule.id,
      scheduleRunId: run.id,
      status: updated.status,
      targetType: schedule.targetType,
      userId,
    });
    await dispatchScheduleNotifications({
      eventType: "SCHEDULE_RUN_FAILED",
      notificationPolicy: schedule.notificationPolicy,
      outputSummary: updated.errorMessage,
      projectId: schedule.projectId,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scheduleRunId: updated.id,
      status: updated.status,
      store,
      userId,
    });
    return serializeScheduleRun(updated);
  }
}

async function resolveOverlap({
  mode,
  schedule,
  scheduledFor,
  store,
  userId,
}: {
  mode: RunMode;
  schedule: {
    id: string;
    overlapPolicy: string;
    projectId: string | null;
    targetType: string;
  };
  scheduledFor?: Date;
  store: ScheduleStore;
  userId: string;
}) {
  if (schedule.overlapPolicy === "ALLOW_ALL") return null;
  const active = await store.scheduleRun.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      scheduleId: schedule.id,
      status: { in: ["RUNNING", "WAITING_FOR_APPROVAL", "WAITING_FOR_INTEGRATION"] },
    },
  });
  if (!active) return null;

  if (schedule.overlapPolicy === "CANCEL_OTHER" || schedule.overlapPolicy === "TERMINATE_OTHER") {
    await store.scheduleRun.update({
      data: {
        completedAt: new Date(),
        errorCode: "overlap_cancelled",
        errorMessage: `Cancelled by ${mode} run because overlap policy is ${schedule.overlapPolicy}.`,
        status: "CANCELLED",
      },
      where: { id: active.id },
    });
    return null;
  }

  const skipped = await store.scheduleRun.create({
    data: {
      completedAt: new Date(),
      errorCode: "overlap_skipped",
      errorMessage: `Skipped because run ${active.id} is still ${active.status.toLowerCase()}.`,
      input: jsonInput({}),
      outputSummary: `Skipped because ${schedule.overlapPolicy.toLowerCase()} overlap policy found an active run.`,
      projectId: schedule.projectId ?? null,
      runMode: mode,
      scheduleId: schedule.id,
      scheduledFor: scheduledFor ?? null,
      status: "SKIPPED",
      userId,
    },
  });
  await appendScheduleAudit({
    event: "schedule_run_skipped",
    metadata: { activeRunId: active.id, overlapPolicy: schedule.overlapPolicy },
    projectId: schedule.projectId ?? null,
    scheduleId: schedule.id,
    scheduleRunId: skipped.id,
    status: skipped.status,
    targetType: schedule.targetType,
    userId,
  });
  return serializeScheduleRun(skipped);
}

export async function backfillSchedule({
  from,
  maxRuns = 5,
  scheduleId,
  store = prisma,
  to,
  userId,
}: {
  from: Date;
  maxRuns?: number;
  scheduleId: string;
  store?: ScheduleStore;
  to: Date;
  userId: string;
}) {
  const schedule = await store.schedule.findFirst({ where: { id: scheduleId, userId } });
  if (!schedule) throw new Error("Schedule not found");
  await appendScheduleAudit({
    event: "schedule_backfill_started",
    metadata: { from: from.toISOString(), maxRuns, to: to.toISOString() },
    projectId: schedule.projectId,
    scheduleId: schedule.id,
    targetType: schedule.targetType,
    userId,
  });
  const runs: ScheduleRunSummary[] = [];
  const cursor = new Date(from);
  while (cursor <= to && runs.length < maxRuns) {
    runs.push(await runScheduleNow({
      mode: "backfill",
      scheduleId,
      scheduledFor: new Date(cursor),
      store,
      userId,
    }));
    cursor.setDate(cursor.getDate() + 1);
  }
  await appendScheduleAudit({
    event: "schedule_backfill_completed",
    metadata: { runCount: runs.length },
    projectId: schedule.projectId,
    scheduleId: schedule.id,
    targetType: schedule.targetType,
    userId,
  });
  return runs;
}

export function previewNaturalSchedule({ text, timezone }: { text: string; timezone?: string }) {
  return parseNaturalSchedule({ text, ...(timezone ? { timezone } : {}) });
}

async function executeScheduleTarget({
  mode,
  runId,
  schedule,
  store,
  userId,
}: {
  mode: RunMode;
  runId: string;
  schedule: {
    id: string;
    input: unknown;
    projectId?: string | null;
    targetRef: unknown;
    targetType: string;
  };
  store: ScheduleStore;
  userId: string;
}) {
  const input = normalizeRecord(schedule.input);
  const targetRef = normalizeRecord(schedule.targetRef);
  const trace = [{ status: "completed", title: "Schedule target selected", type: schedule.targetType }];
  if (mode === "test") {
    return {
      artifacts: jsonInput([]),
      changeDetected: false,
      outputSummary: "Test run validated schedule target, integration health, quota policy, and run metadata without executing sensitive external actions.",
      sources: jsonInput([]),
      trace: jsonInput([...trace, { status: "completed", title: "Dry run completed", type: "TEST" }]),
    };
  }

  if (schedule.targetType === "SKILL" || schedule.targetType === "WIDE_RESEARCH") {
    const skillIdOrSlug = String(targetRef.skillId ?? targetRef.skillSlug ?? "");
    if (!skillIdOrSlug) throw new Error("Schedule Skill target requires skillId or skillSlug");
    const runRequest = {
      inputs: input,
      ...(schedule.projectId ? { projectId: schedule.projectId } : {}),
      ...(schedule.targetType === "WIDE_RESEARCH" ? { runtimeMode: "wide_research" as const } : {}),
      trigger: "SCHEDULED" as const,
    };
    const run = await runSkill({
      request: runRequest,
      skillIdOrSlug,
      store,
      userId,
    });
    return {
      artifacts: jsonInput(run.artifacts),
      changeDetected: detectChange(schedule.targetType, run.resultSummary),
      changeSummary: run.resultSummary ?? null,
      outputSummary: run.resultSummary ?? `${run.skillName} completed.`,
      skillRunId: run.id,
      sources: jsonInput(run.artifacts.flatMap((artifact) => artifact.citations ?? [])),
      trace: jsonInput([...trace, ...run.steps.map((step) => ({ status: step.status, title: step.title, type: step.type }))]),
    };
  }

  if (schedule.targetType === "SKILL_WORKFLOW") {
    const workflowId = String(targetRef.workflowId ?? "");
    if (!workflowId) throw new Error("Schedule Skill workflow target requires workflowId");
    const run = await runSkillWorkflow({ inputs: input, store, userId, workflowId });
    return {
      artifacts: jsonInput(normalizeArray(run.artifactMap)),
      outputSummary: run.status === "COMPLETED" ? "Skill workflow completed." : run.errorMessage ?? "Skill workflow failed.",
      skillWorkflowRunId: run.id,
      sources: jsonInput([]),
      trace: jsonInput([...trace, { status: run.status, title: "Skill workflow run", type: "WORKFLOW" }]),
    };
  }

  const goal = String(targetRef.goal ?? input.goal ?? "");
  if (!goal) throw new Error("Schedule task target requires a goal");
  const directMessage = typeof input.message === "string"
    ? input.message
    : typeof targetRef.message === "string"
      ? targetRef.message
      : null;
  if ((input.directMessage === true || targetRef.directMessage === true) && directMessage?.trim()) {
    return {
      artifacts: jsonInput([]),
      outputSummary: directMessage.trim(),
      sources: jsonInput([]),
      trace: jsonInput([...trace, { status: "completed", title: "Direct scheduled message prepared", type: "TASK" }]),
    };
  }
  const agentRun = await createAgentRunForSchedule({
    goal,
    ...(schedule.projectId ? { projectId: schedule.projectId } : {}),
    store,
    userId,
  });
  await store.scheduleRun.update({ data: { agentRunId: agentRun.id }, where: { id: runId } });
  await runAgent(agentRun.id, goal, { backend: "local" });
  const completed = await store.agentRun.findUnique({ where: { id: agentRun.id } });
  return {
    agentRunId: agentRun.id,
    artifacts: jsonInput([]),
    outputSummary: completed?.result ?? "Task schedule completed.",
    sources: jsonInput([]),
    trace: jsonInput([...trace, { status: completed?.status ?? "UNKNOWN", title: "Agent task run", type: "TASK" }]),
  };
}

async function createAgentRunForSchedule({
  goal,
  projectId,
  store,
  userId,
}: {
  goal: string;
  projectId?: string;
  store: ScheduleStore;
  userId: string;
}) {
  const project = projectId
    ? await store.project.findUnique({ where: { id: projectId } })
    : await store.project.upsert({
        create: { defaultBackend: "LOCAL", id: "default-project", name: "Personal" },
        update: {},
        where: { id: "default-project" },
      });
  if (!project) throw new Error("Project not found for scheduled task");
  const conversation = await store.conversation.create({
    data: {
      messages: { create: { content: goal, role: "USER" } },
      projectId: project.id,
      title: goal.slice(0, 80),
    },
  });
  return store.agentRun.create({
    data: {
      asyncMode: true,
      backend: "LOCAL",
      conversationId: conversation.id,
      goal,
      queuedAt: new Date(),
      status: "QUEUED",
      userId,
    },
  });
}

async function checkIntegrationHealth({
  schedule,
  store,
  userId,
}: {
  schedule: { input: unknown; targetRef: unknown; targetType: string };
  store: ScheduleStore;
  userId: string;
}) {
  const connectors = await requiredConnectors({ schedule, store });
  if (connectors.length === 0) return [];
  const rows = await store.integration.findMany({
    where: {
      connectorId: { in: connectors.map(connectorToDb).filter(Boolean) as never[] },
      status: "CONNECTED",
      userId,
    },
  });
  const connected = new Set(rows.map((row) => row.connectorId));
  return connectors.map((connectorId) => ({
    connectorId,
    status: connected.has((connectorToDb(connectorId) ?? "") as never) ? "ok" : "missing",
  }));
}

async function requiredConnectors({
  schedule,
  store,
}: {
  schedule: { input: unknown; targetRef: unknown; targetType: string };
  store: ScheduleStore;
}) {
  const input = normalizeRecord(schedule.input);
  const targetRef = normalizeRecord(schedule.targetRef);
  const explicit = normalizeArray(input.requiredConnectors)
    .concat(normalizeArray(targetRef.requiredConnectors))
    .map(String);
  if (explicit.length > 0) return Array.from(new Set(explicit));
  if (schedule.targetType === "SKILL" || schedule.targetType === "WIDE_RESEARCH") {
    const skillIdOrSlug = String(targetRef.skillId ?? targetRef.skillSlug ?? "");
    if (!skillIdOrSlug) return [];
    const skill = await store.skill.findFirst({
      where: { OR: [{ id: skillIdOrSlug }, { slug: skillIdOrSlug }], archivedAt: null, enabled: true },
    });
    return skill?.requiredIntegrations ?? [];
  }
  return [];
}

async function checkQuota({
  schedule,
  store,
}: {
  schedule: { id: string; quotaPolicy: unknown };
  store: ScheduleStore;
}) {
  const policy = normalizeRecord(schedule.quotaPolicy);
  const maxRunsPerDay = typeof policy.maxRunsPerDay === "number" ? policy.maxRunsPerDay : 25;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const runsToday = await store.scheduleRun.count({
    where: { createdAt: { gte: start }, scheduleId: schedule.id },
  });
  const snapshot = { maxRunsPerDay, runsToday };
  if (runsToday > maxRunsPerDay) {
    return { allowed: false, reason: `Schedule exceeded ${maxRunsPerDay} runs today.`, snapshot };
  }
  return { allowed: true, snapshot };
}

async function registerTemporalSchedule({
  schedule,
}: {
  schedule: {
    cronExpression?: string | null;
    id: string;
    timezone: string;
  };
  store: ScheduleStore;
}) {
  if (!schedule.cronExpression) return null;
  const settings = await loadTemporalSettings();
  if (!settings.enabled) return null;
  const client = await createTemporalClient(settings);
  const temporalScheduleId = `handle-schedule-${schedule.id}`;
  await client.schedule.create({
    action: {
      args: [{ scheduleId: schedule.id }],
      taskQueue: settings.taskQueue || DEFAULT_TEMPORAL_TASK_QUEUE,
      type: "startWorkflow",
      workflowId: `${temporalScheduleId}-workflow`,
      workflowType: "scheduledRunWorkflow",
    },
    policies: { overlap: "SKIP" as never },
    scheduleId: temporalScheduleId,
    spec: {
      cronExpressions: [schedule.cronExpression],
      timezone: schedule.timezone,
    },
  });
  return temporalScheduleId;
}

async function reconcileTemporalSchedule({
  existing,
  schedule,
  store,
}: {
  existing: {
    cronExpression?: string | null;
    temporalScheduleId?: string | null;
    timezone: string;
  };
  schedule: {
    cronExpression?: string | null;
    enabled: boolean;
    id: string;
    temporalScheduleId?: string | null;
    timezone: string;
  };
  store: ScheduleStore;
}) {
  const changedSpec =
    existing.cronExpression !== schedule.cronExpression ||
    existing.timezone !== schedule.timezone;

  if (schedule.temporalScheduleId && (!schedule.enabled || !schedule.cronExpression || changedSpec)) {
    await deleteTemporalSchedule(schedule.temporalScheduleId);
    return schedule.enabled && schedule.cronExpression
      ? registerTemporalSchedule({ schedule, store }).catch((err) => {
          logger.warn({ err, scheduleId: schedule.id }, "Temporal schedule registration failed");
          return null;
        })
      : null;
  }

  if (schedule.enabled && schedule.cronExpression && !schedule.temporalScheduleId) {
    return registerTemporalSchedule({ schedule, store }).catch((err) => {
      logger.warn({ err, scheduleId: schedule.id }, "Temporal schedule registration failed");
      return null;
    });
  }

  return schedule.temporalScheduleId ?? null;
}

async function deleteTemporalSchedule(temporalScheduleId: string) {
  const settings = await loadTemporalSettings();
  if (!settings.enabled) return;
  try {
    const client = await createTemporalClient(settings);
    await client.schedule.getHandle(temporalScheduleId).delete();
  } catch (err) {
    logger.warn({ err, temporalScheduleId }, "Temporal schedule deletion failed");
  }
}

async function validateTarget({
  input,
  store,
  userId,
}: {
  input: Required<Pick<CreateScheduleRequest, "targetRef" | "targetType" | "timezone">> & CreateScheduleRequest;
  store: ScheduleStore;
  userId: string;
}) {
  const targetRef = normalizeRecord(input.targetRef);
  if (input.targetType === "TASK") {
    if (!targetRef.goal && !input.input?.goal) throw new Error("Task schedule requires a goal");
    return;
  }
  if (input.targetType === "SKILL" || input.targetType === "WIDE_RESEARCH") {
    const skillIdOrSlug = String(targetRef.skillId ?? targetRef.skillSlug ?? "");
    if (!skillIdOrSlug) throw new Error("Skill schedule requires skillId or skillSlug");
    const skill = await store.skill.findFirst({
      where: {
        OR: [{ id: skillIdOrSlug }, { slug: skillIdOrSlug }],
        archivedAt: null,
        enabled: true,
      },
    });
    if (!skill) throw new Error("Skill not found for schedule");
    if (skill.visibility === "PERSONAL" && skill.ownerUserId !== userId) throw new Error("Skill not available");
    return;
  }
  if (input.targetType === "SKILL_WORKFLOW") {
    const workflowId = String(targetRef.workflowId ?? "");
    if (!workflowId) throw new Error("Skill workflow schedule requires workflowId");
    const workflow = await store.skillWorkflow.findFirst({ where: { id: workflowId, userId } });
    if (!workflow) throw new Error("Skill workflow not found for schedule");
  }
}

function normalizeCreateInput(input: CreateScheduleRequest): CreateScheduleRequest & {
  cronExpression: string | null;
  runAt: string | null;
  timezone: string;
} {
  const timezone = input.timezone ?? "America/Chicago";
  if (input.naturalLanguage && !input.cronExpression && !input.runAt) {
    const parsed = parseNaturalSchedule({ text: input.naturalLanguage, timezone });
    return {
      ...input,
      cronExpression: parsed.cronExpression ?? null,
      runAt: parsed.runAt ?? null,
      timezone,
    };
  }
  return {
    ...input,
    cronExpression: input.cronExpression ?? null,
    runAt: input.runAt ?? null,
    timezone,
  };
}

function connectorToDb(value: string) {
  const normalized = value.toUpperCase().replaceAll("-", "_");
  const aliases: Record<string, string> = {
    DRIVE: "GOOGLE_DRIVE",
    GITHUB: "GITHUB",
    GMAIL: "GMAIL",
    GOOGLE_CALENDAR: "GOOGLE_CALENDAR",
    GOOGLE_DOCS: "GOOGLE_DOCS",
    GOOGLE_DRIVE: "GOOGLE_DRIVE",
    GOOGLE_SHEETS: "GOOGLE_SHEETS",
    LINEAR: "LINEAR",
    NOTION: "NOTION",
    SLACK: "SLACK",
  };
  return aliases[normalized] ?? normalized;
}

function detectChange(targetType: string, summary?: string | null) {
  if (!summary) return false;
  return targetType === "WIDE_RESEARCH" && /\bnew|changed|updated|announced|launched\b/i.test(summary);
}

function redactUnknown<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
