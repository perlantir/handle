import type {
  IntegrationConnectorId,
  SkillArtifactSummary,
  SkillDetail,
  SkillIconSummary,
  SkillInputSlotSummary,
  SkillRunDetail,
  SkillRunStepSummary,
  SkillRunSummary,
  SkillSummary,
} from "@handle/shared";
import { parseSkillMarkdown } from "./skillMarkdown";

type SkillRow = {
  activationExamples: unknown;
  archivedAt?: Date | null;
  category: string;
  createdAt?: Date;
  description: string;
  enabled: boolean;
  evalFixtures: unknown;
  icon: unknown;
  id: string;
  inputSlots: unknown;
  name: string;
  negativeActivationExamples: unknown;
  optionalIntegrations: string[];
  outputArtifactContract: unknown;
  packageMetadata: unknown;
  requiredIntegrations: string[];
  reusableResources: unknown;
  runtimePolicy: unknown;
  approvalPolicy: unknown;
  schedulingConfig: unknown;
  skillMd: string;
  slug: string;
  sourceCitationPolicy: unknown;
  sourceType: string;
  toolPolicy: unknown;
  uiTemplate: string;
  updatedAt?: Date;
  version: string;
  visibility: string;
};

type RunRow = {
  artifacts?: ArtifactRow[];
  completedAt?: Date | null;
  createdAt?: Date;
  effectivePolicies?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  id: string;
  inputs: unknown;
  modelName?: string | null;
  projectId?: string | null;
  providerId?: string | null;
  resultSummary?: string | null;
  skill?: SkillRow | null;
  skillId: string;
  startedAt?: Date | null;
  status: string;
  steps?: StepRow[];
  trigger: string;
  updatedAt?: Date;
  userId?: string;
  conversationId?: string | null;
  agentRunId?: string | null;
};

type StepRow = {
  approvalId?: string | null;
  artifactId?: string | null;
  completedAt?: Date | null;
  connectorId?: string | null;
  id: string;
  index: number;
  metadata?: unknown;
  safeSummary: string;
  startedAt?: Date;
  status: string;
  title: string;
  toolName?: string | null;
  type: string;
};

type ArtifactRow = {
  citations: unknown;
  contentRef?: string | null;
  createdAt?: Date;
  id: string;
  inlineContent?: string | null;
  kind: string;
  metadata?: unknown;
  mimeType: string;
  skillRunId: string;
  title: string;
  updatedAt?: Date;
};

export function serializeSkillSummary(
  row: SkillRow & { runs?: RunRow[] },
  options: {
    connectedIntegrations?: Set<IntegrationConnectorId>;
    runCount?: number;
  } = {},
): SkillSummary {
  const requiredIntegrations = normalizeConnectorIds(row.requiredIntegrations);
  const connected = options.connectedIntegrations ?? new Set<IntegrationConnectorId>();
  const missingIntegrations = requiredIntegrations.filter((connectorId) => !connected.has(connectorId));
  const recentRun = row.runs?.[0] ? serializeSkillRunSummary(row.runs[0]) : null;
  return stripUndefined({
    category: row.category,
    createdAt: row.createdAt?.toISOString(),
    description: row.description,
    enabled: row.enabled && !row.archivedAt,
    icon: normalizeIcon(row.icon),
    id: row.id,
    inputSlots: normalizeInputSlots(row.inputSlots),
    missingIntegrations,
    name: row.name,
    optionalIntegrations: normalizeConnectorIds(row.optionalIntegrations),
    recentRun,
    requiredIntegrations,
    runCount: options.runCount ?? row.runs?.length ?? 0,
    slug: row.slug,
    sourceType: row.sourceType as SkillSummary["sourceType"],
    status: !row.enabled || row.archivedAt ? "disabled" : missingIntegrations.length > 0 ? "needs_integration" : "ready",
    uiTemplate: row.uiTemplate,
    updatedAt: row.updatedAt?.toISOString(),
    version: row.version,
    visibility: row.visibility as SkillSummary["visibility"],
  }) as unknown as SkillSummary;
}

export function serializeSkillDetail(
  row: SkillRow & { runs?: RunRow[] },
  options: { connectedIntegrations?: Set<IntegrationConnectorId> } = {},
): SkillDetail {
  const summary = serializeSkillSummary(
    row,
    stripUndefined({
      connectedIntegrations: options.connectedIntegrations,
      runCount: row.runs?.length ?? 0,
    }) as { connectedIntegrations?: Set<IntegrationConnectorId>; runCount?: number },
  );
  const detail = {
    ...summary,
    activationExamples: normalizeStringArray(row.activationExamples),
    approvalPolicy: normalizeRecord(row.approvalPolicy),
    evalFixtures: normalizeArray(row.evalFixtures),
    markdownSections: parseSkillMarkdown(row.skillMd),
    negativeActivationExamples: normalizeStringArray(row.negativeActivationExamples),
    outputArtifactContract: normalizeRecord(row.outputArtifactContract),
    packageMetadata: normalizeRecord(row.packageMetadata),
    recentRuns: (row.runs ?? []).map(serializeSkillRunSummary),
    reusableResources: normalizeArray(row.reusableResources),
    runtimePolicy: normalizeRecord(row.runtimePolicy),
    schedulingConfig: normalizeRecord(row.schedulingConfig),
    skillMd: row.skillMd,
    sourceCitationPolicy: normalizeRecord(row.sourceCitationPolicy),
    toolPolicy: normalizeRecord(row.toolPolicy),
  };
  return stripUndefined(detail) as unknown as SkillDetail;
}

export function serializeSkillRunSummary(row: RunRow): SkillRunSummary {
  return stripUndefined({
    agentRunId: row.agentRunId,
    artifactCount: row.artifacts?.length ?? 0,
    completedAt: row.completedAt?.toISOString() ?? null,
    conversationId: row.conversationId,
    createdAt: row.createdAt?.toISOString(),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    id: row.id,
    inputs: normalizeRecord(row.inputs),
    projectId: row.projectId,
    resultSummary: row.resultSummary,
    skillId: row.skillId,
    skillName: row.skill?.name,
    skillSlug: row.skill?.slug,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status as SkillRunSummary["status"],
    stepCount: row.steps?.length ?? 0,
    trigger: row.trigger as SkillRunSummary["trigger"],
    updatedAt: row.updatedAt?.toISOString(),
    userId: row.userId,
  }) as unknown as SkillRunSummary;
}

export function serializeSkillRunDetail(row: RunRow): SkillRunDetail {
  return stripUndefined({
    ...serializeSkillRunSummary(row),
    artifacts: (row.artifacts ?? []).map(serializeArtifact),
    effectivePolicies: normalizeRecord(row.effectivePolicies),
    modelName: row.modelName,
    providerId: row.providerId,
    skill: row.skill ? serializeSkillSummary(row.skill) : undefined,
    steps: (row.steps ?? []).map(serializeStep),
  }) as unknown as SkillRunDetail;
}

function serializeStep(row: StepRow): SkillRunStepSummary {
  return stripUndefined({
    approvalId: row.approvalId,
    artifactId: row.artifactId,
    completedAt: row.completedAt?.toISOString() ?? null,
    connectorId: row.connectorId,
    id: row.id,
    index: row.index,
    metadata: normalizeRecord(row.metadata),
    safeSummary: row.safeSummary,
    startedAt: row.startedAt?.toISOString(),
    status: row.status,
    title: row.title,
    toolName: row.toolName,
    type: row.type as SkillRunStepSummary["type"],
  }) as unknown as SkillRunStepSummary;
}

function serializeArtifact(row: ArtifactRow): SkillArtifactSummary {
  return stripUndefined({
    citations: normalizeRecordArray(row.citations),
    contentRef: row.contentRef,
    createdAt: row.createdAt?.toISOString(),
    id: row.id,
    inlineContent: row.inlineContent,
    kind: row.kind as SkillArtifactSummary["kind"],
    metadata: normalizeRecord(row.metadata),
    mimeType: row.mimeType,
    skillRunId: row.skillRunId,
    title: row.title,
    updatedAt: row.updatedAt?.toISOString(),
  }) as unknown as SkillArtifactSummary;
}

function normalizeConnectorIds(value: string[]) {
  return value.map((item) => item.toLowerCase().replaceAll("_", "-")) as IntegrationConnectorId[];
}

function normalizeIcon(value: unknown): SkillIconSummary {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      kind: record.kind === "icon" ? "icon" : "letter",
      value: typeof record.value === "string" ? record.value : "S",
      ...(typeof record.tone === "string" ? { tone: record.tone } : {}),
    };
  }
  return { kind: "letter", value: "S" };
}

function normalizeInputSlots(value: unknown): SkillInputSlotSummary[] {
  return Array.isArray(value) ? (value as SkillInputSlotSummary[]) : [];
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}
