import type { ScheduleRunSummary, ScheduleSummary, ScheduleTemplateSummary } from "@handle/shared";

export function serializeSchedule(row: {
  archivedAt?: Date | null;
  approvalPolicy: unknown;
  catchupPolicy: string;
  changeDetectionPolicy: unknown;
  createdAt?: Date;
  cronExpression?: string | null;
  description?: string | null;
  enabled: boolean;
  id: string;
  input: unknown;
  lastRunAt?: Date | null;
  legacySkillScheduleId?: string | null;
  metadata: unknown;
  name: string;
  naturalLanguage?: string | null;
  nextRunAt?: Date | null;
  notificationPolicy: unknown;
  overlapPolicy: string;
  projectId?: string | null;
  quotaPolicy: unknown;
  runAt?: Date | null;
  runs?: Array<ScheduleRunRow>;
  status: string;
  targetRef: unknown;
  targetType: string;
  temporalScheduleId?: string | null;
  timezone: string;
  updatedAt?: Date;
  userId?: string;
}): ScheduleSummary {
  return stripUndefined({
    archivedAt: row.archivedAt?.toISOString() ?? null,
    approvalPolicy: normalizeRecord(row.approvalPolicy),
    catchupPolicy: row.catchupPolicy as ScheduleSummary["catchupPolicy"],
    changeDetectionPolicy: normalizeRecord(row.changeDetectionPolicy),
    createdAt: row.createdAt?.toISOString(),
    cronExpression: row.cronExpression ?? null,
    description: row.description ?? null,
    enabled: row.enabled,
    id: row.id,
    input: normalizeRecord(row.input),
    lastRun: row.runs?.[0] ? serializeScheduleRun(row.runs[0]) : null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    legacySkillScheduleId: row.legacySkillScheduleId ?? null,
    metadata: normalizeRecord(row.metadata),
    name: row.name,
    naturalLanguage: row.naturalLanguage ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    notificationPolicy: normalizeRecord(row.notificationPolicy),
    overlapPolicy: row.overlapPolicy as ScheduleSummary["overlapPolicy"],
    projectId: row.projectId ?? null,
    quotaPolicy: normalizeRecord(row.quotaPolicy),
    runAt: row.runAt?.toISOString() ?? null,
    status: row.status as ScheduleSummary["status"],
    targetRef: normalizeRecord(row.targetRef),
    targetType: row.targetType as ScheduleSummary["targetType"],
    temporalScheduleId: row.temporalScheduleId ?? null,
    timezone: row.timezone,
    updatedAt: row.updatedAt?.toISOString(),
    ...(row.userId ? { userId: row.userId } : {}),
  }) as ScheduleSummary;
}

export interface ScheduleRunRow {
  agentRunId?: string | null;
  approvalState: unknown;
  artifacts: unknown;
  changeDetected: boolean;
  changeSummary?: string | null;
  completedAt?: Date | null;
  costUsd?: unknown;
  createdAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  healthChecks: unknown;
  id: string;
  input: unknown;
  outputSummary?: string | null;
  projectId?: string | null;
  quotaSnapshot: unknown;
  runMode: string;
  scheduleId: string;
  scheduledFor?: Date | null;
  skillRunId?: string | null;
  skillWorkflowRunId?: string | null;
  sources: unknown;
  startedAt?: Date | null;
  status: string;
  temporalWorkflowId?: string | null;
  trace: unknown;
  updatedAt?: Date;
  userId?: string;
}

export function serializeScheduleRun(row: ScheduleRunRow): ScheduleRunSummary {
  return stripUndefined({
    agentRunId: row.agentRunId ?? null,
    approvalState: normalizeRecord(row.approvalState),
    artifacts: normalizeArray(row.artifacts),
    changeDetected: row.changeDetected,
    changeSummary: row.changeSummary ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    costUsd: row.costUsd ? Number(row.costUsd).toFixed(4) : null,
    createdAt: row.createdAt?.toISOString(),
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    healthChecks: normalizeArray(row.healthChecks),
    id: row.id,
    input: normalizeRecord(row.input),
    outputSummary: row.outputSummary ?? null,
    projectId: row.projectId ?? null,
    quotaSnapshot: normalizeRecord(row.quotaSnapshot),
    runMode: row.runMode as ScheduleRunSummary["runMode"],
    scheduleId: row.scheduleId,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    skillRunId: row.skillRunId ?? null,
    skillWorkflowRunId: row.skillWorkflowRunId ?? null,
    sources: normalizeArray(row.sources),
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status as ScheduleRunSummary["status"],
    temporalWorkflowId: row.temporalWorkflowId ?? null,
    trace: normalizeArray(row.trace),
    updatedAt: row.updatedAt?.toISOString(),
    ...(row.userId ? { userId: row.userId } : {}),
  }) as ScheduleRunSummary;
}

export function serializeTemplate(row: {
  category: string;
  createdAt?: Date;
  description: string;
  enabled: boolean;
  id: string;
  inputDefaults: unknown;
  name: string;
  policyDefaults: unknown;
  requiredConnectors: string[];
  scheduleDefaults: unknown;
  slug: string;
  targetRef: unknown;
  targetType: string;
  updatedAt?: Date;
}): ScheduleTemplateSummary {
  return stripUndefined({
    category: row.category,
    createdAt: row.createdAt?.toISOString(),
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    inputDefaults: normalizeRecord(row.inputDefaults),
    name: row.name,
    policyDefaults: normalizeRecord(row.policyDefaults),
    requiredConnectors: row.requiredConnectors,
    scheduleDefaults: normalizeRecord(row.scheduleDefaults),
    slug: row.slug,
    targetRef: normalizeRecord(row.targetRef),
    targetType: row.targetType as ScheduleTemplateSummary["targetType"],
    updatedAt: row.updatedAt?.toISOString(),
  }) as ScheduleTemplateSummary;
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
