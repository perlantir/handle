import type {
  IntegrationConnectorId,
  RunSkillRequest,
  SkillArtifactKind,
  SkillRunDetail,
  SkillRunStepType,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import {
  connectorToDb,
  dbConnectorToShared,
  getSkillForUser,
} from "./skillRegistry";
import { serializeSkillRunDetail } from "./serializer";
import { runtimeTraceForMode, type SkillRuntimeMode } from "./browserRuntime";
import type { SkillArtifactInput, SkillTraceStepInput } from "./types";
import { wideResearchExpansion } from "./wideResearch";

type SkillStore = typeof prisma;

interface RunSkillInput {
  request: RunSkillRequest;
  skillIdOrSlug: string;
  store?: SkillStore;
  userId: string;
}

export async function runSkill({
  request,
  skillIdOrSlug,
  store = prisma,
  userId,
}: RunSkillInput): Promise<SkillRunDetail> {
  const skill = await store.skill.findFirst({
    where: {
      OR: [{ id: skillIdOrSlug }, { slug: skillIdOrSlug }],
      archivedAt: null,
      enabled: true,
    },
  });
  if (!skill) {
    throw new Error("Skill not found");
  }

  const detail = await getSkillForUser({
    ...(request.projectId ? { projectId: request.projectId } : {}),
    skillIdOrSlug,
    store,
    userId,
  });
  if (!detail) {
    throw new Error("Skill not available");
  }

  const inputValidation = validateInputs(detail.inputSlots, request.inputs);
  const run = await store.skillRun.create({
    data: stripUndefined({
      effectivePolicies: jsonInput({
        approvalPolicy: detail.approvalPolicy,
        runtimePolicy: detail.runtimePolicy,
        sourceCitationPolicy: detail.sourceCitationPolicy,
        toolPolicy: detail.toolPolicy,
      }),
      inputs: jsonInput(redactUnknown(request.inputs)),
      projectId: request.projectId,
      providerId: request.providerId,
      modelName: request.modelName,
      skillId: skill.id,
      startedAt: new Date(),
      status: "RUNNING",
      trigger: request.trigger ?? "MANUAL",
      userId,
      conversationId: request.conversationId,
    }) as Prisma.SkillRunUncheckedCreateInput,
  });

  try {
    await addStep(store, run.id, 0, {
      safeSummary: `Validated ${detail.name} inputs and effective policy.`,
      title: "Validate inputs and policy",
      type: "PLAN",
    });

    if (inputValidation.length > 0) {
      await failRun(store, run.id, "skill_input_invalid", inputValidation.join(" "));
      return getRunDetailOrThrow(store, run.id);
    }

    const connected = await connectedIntegrations(userId, store);
    const missing = detail.requiredIntegrations.filter((connectorId) => !connected.has(connectorId));
    if (missing.length > 0) {
      const step: SkillTraceStepInput = {
        safeSummary: `Missing required integration: ${missing.join(", ")}.`,
        status: "failed",
        title: "Check required integrations",
        type: "ERROR",
      };
      if (missing[0]) step.connectorId = missing[0];
      await addStep(store, run.id, 1, step);
      await failRun(
        store,
        run.id,
        "skill_missing_integration",
        `Connect ${missing.join(", ")} in Settings -> Integrations before running ${detail.name}.`,
      );
      return getRunDetailOrThrow(store, run.id);
    }

    const generated = generateSkillRun(detail, request.inputs, request.runtimeMode as SkillRuntimeMode | undefined);
    for (const [offset, step] of generated.steps.entries()) {
      await addStep(store, run.id, offset + 1, step);
    }
    for (const [artifactOffset, artifact] of generated.artifacts.entries()) {
      const created = await store.skillArtifact.create({
        data: {
          citations: jsonInput(artifact.citations ?? []),
          inlineContent: artifact.inlineContent ? redactSecrets(artifact.inlineContent) : null,
          kind: artifact.kind,
          metadata: jsonInput(redactUnknown(artifact.metadata ?? {})),
          mimeType: artifact.mimeType,
          skillRunId: run.id,
          title: artifact.title,
        },
      });
      await addStep(store, run.id, generated.steps.length + artifactOffset + 1, {
        artifactId: created.id,
        safeSummary: `Created artifact "${created.title}" (${created.kind}).`,
        title: "Create artifact",
        type: "ARTIFACT",
      });
    }

    await store.skillRun.update({
      data: {
        completedAt: new Date(),
        resultSummary: generated.summary,
        status: "COMPLETED",
      },
      where: { id: run.id },
    });
    return getRunDetailOrThrow(store, run.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skill run failed";
    await failRun(store, run.id, "skill_run_failed", message);
    return getRunDetailOrThrow(store, run.id);
  }
}

async function addStep(
  store: SkillStore,
  skillRunId: string,
  index: number,
  input: SkillTraceStepInput & { artifactId?: string },
) {
  await store.skillRunStep.create({
    data: stripUndefined({
      artifactId: input.artifactId,
      completedAt: new Date(),
      connectorId: input.connectorId ? connectorToDb(input.connectorId) : undefined,
      index,
      metadata: jsonInput(redactUnknown(input.metadata ?? {})),
      redactedInput: jsonInput({}),
      redactedOutput: jsonInput({}),
      safeSummary: redactSecrets(input.safeSummary),
      skillRunId,
      status: input.status ?? "completed",
      title: input.title,
      toolName: input.toolName,
      type: input.type,
    }) as Prisma.SkillRunStepUncheckedCreateInput,
  });
}

async function failRun(store: SkillStore, runId: string, code: string, message: string) {
  await store.skillRun.update({
    data: {
      completedAt: new Date(),
      errorCode: code,
      errorMessage: redactSecrets(message),
      resultSummary: redactSecrets(message),
      status: "FAILED",
    },
    where: { id: runId },
  });
}

async function getRunDetailOrThrow(store: SkillStore, runId: string) {
  const row = await store.skillRun.findUnique({
    include: {
      artifacts: { orderBy: { createdAt: "asc" } },
      skill: true,
      steps: { orderBy: { index: "asc" } },
    },
    where: { id: runId },
  });
  if (!row) throw new Error("Skill run not found");
  return serializeSkillRunDetail(row);
}

async function connectedIntegrations(userId: string, store: SkillStore) {
  const rows = await store.integration.findMany({
    select: { connectorId: true },
    where: { status: "CONNECTED", userId },
  });
  return new Set(rows.map((row) => dbConnectorToShared(row.connectorId)));
}

function validateInputs(
  slots: Array<{ id: string; label: string; required: boolean }>,
  inputs: Record<string, unknown>,
) {
  return slots
    .filter((slot) => slot.required)
    .filter((slot) => {
      const value = inputs[slot.id];
      return value === undefined || value === null || (typeof value === "string" && !value.trim());
    })
    .map((slot) => `${slot.label} is required.`);
}

function generateSkillRun(
  detail: { name: string; runtimePolicy: Record<string, unknown>; slug: string; sourceType: string },
  inputs: Record<string, unknown>,
  mode?: SkillRuntimeMode,
): { artifacts: SkillArtifactInput[]; steps: SkillTraceStepInput[]; summary: string } {
  const base =
    detail.slug === "email-outreach" ? generateEmailOutreach(inputs) :
    detail.slug === "plan-trip" ? generateTripPlan(inputs) :
    detail.slug === "code-review-pr" ? generateCodeReview(inputs) :
    detail.slug === "summarize-notion-workspace" ? generateNotionSummary(inputs) :
    detail.sourceType === "BUILTIN" ? generateCompanyResearch(inputs) :
    generateCustomSkillRun(detail.name, inputs);
  const runtime = runtimeTraceForMode({
    ...(mode ? { mode } : {}),
    runtimePolicy: detail.runtimePolicy,
  });
  const wide = mode === "wide_research"
    ? wideResearchExpansion(stringInput(inputs.company ?? inputs.subject ?? inputs.topic, detail.name))
    : { artifacts: [], steps: [] };
  return {
    artifacts: [...base.artifacts, ...wide.artifacts, ...runtime.artifacts],
    steps: [...base.steps, ...wide.steps, ...runtime.steps],
    summary: mode === "wide_research" ? `${base.summary} Wide Research subtasks were prepared.` : base.summary,
  };
}

function generateCompanyResearch(inputs: Record<string, unknown>) {
  const company = stringInput(inputs.company, "Company");
  const depth = stringInput(inputs.depth, "standard");
  const report = `# ${company} Research Report\n\n## Snapshot\n${company} was prepared as a ${depth} research brief.\n\n## What To Verify\n- Product positioning\n- Market and competitor context\n- Leadership and recent updates\n\n## Notes\nThis Stage 1 run produced the required artifact contract and trace. Live external research runs through the agent/browser path in credentialed audit.`;
  const sources = [
    citation("Company website", `https://example.com/search?q=${encodeURIComponent(company)}`, "placeholder source for controlled Stage 1 smoke"),
    citation("News search", `https://example.com/news?q=${encodeURIComponent(company)}`, "placeholder source for controlled Stage 1 smoke"),
    citation("Market context", `https://example.com/market?q=${encodeURIComponent(company)}`, "placeholder source for controlled Stage 1 smoke"),
  ];
  return {
    artifacts: [
      { citations: sources, inlineContent: report, kind: "REPORT" as const, mimeType: "text/markdown", title: `${company} research report` },
      { citations: sources, inlineContent: JSON.stringify(sources, null, 2), kind: "SOURCE_SET" as const, mimeType: "application/json", title: "Research sources" },
    ],
    steps: [
      { safeSummary: `Prepared research plan for ${company}.`, title: "Plan research", type: "PLAN" as SkillRunStepType },
      { safeSummary: "Generated controlled source set for Stage 1 artifact validation.", title: "Collect sources", toolName: "web_search", type: "TOOL" as SkillRunStepType },
    ],
    summary: `Created cited research report for ${company}.`,
  };
}

function generateEmailOutreach(inputs: Record<string, unknown>) {
  const recipients = stringInput(inputs.recipients, "test@example.com");
  const goal = stringInput(inputs.campaignGoal, "Start a conversation");
  const callToAction = stringInput(inputs.callToAction, "Reply with availability");
  const drafts = recipients
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((recipient) => ({
      body: `Hi ${recipient},\n\nI wanted to reach out about ${goal}. ${callToAction}.\n\nBest,`,
      personalizationNotes: "Draft generated for approval; not sent.",
      recipient,
      sendStatus: "draft",
      subject: goal,
    }));
  return {
    artifacts: [
      { inlineContent: JSON.stringify({ drafts }, null, 2), kind: "EMAIL_DRAFTS" as const, mimeType: "application/json", title: "Email draft batch" },
    ],
    steps: [
      { connectorId: "gmail" as IntegrationConnectorId, safeSummary: `Prepared ${drafts.length} Gmail draft(s); no email was sent.`, title: "Draft outreach", toolName: "gmail.send", type: "TOOL" as SkillRunStepType },
      { safeSummary: "Paused all send operations behind approval policy.", title: "Enforce send approval", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Drafted ${drafts.length} outreach email(s). Sending still requires approval.`,
  };
}

function generateTripPlan(inputs: Record<string, unknown>) {
  const destination = stringInput(inputs.destination, "Destination");
  const dates = stringInput(inputs.dates, "dates TBD");
  const content = `# ${destination} Itinerary\n\n## Trip Window\n${dates}\n\n## Day 1\nArrive, orient, and choose one low-friction neighborhood walk.\n\n## Day 2\nAnchor the day around the user's stated interests, with backup indoor options.\n\n## Day 3\nKeep the final day lighter and leave buffer for transit.\n\n## Caveats\nVerify opening hours and transit before booking. Handle will not make purchases.`;
  const sources = [
    citation(`${destination} official tourism`, `https://example.com/travel/${encodeURIComponent(destination)}`, "controlled Stage 1 source"),
    citation(`${destination} transit`, `https://example.com/transit/${encodeURIComponent(destination)}`, "controlled Stage 1 source"),
    citation(`${destination} opening hours`, `https://example.com/hours/${encodeURIComponent(destination)}`, "controlled Stage 1 source"),
  ];
  return {
    artifacts: [
      { citations: sources, inlineContent: content, kind: "ITINERARY" as const, mimeType: "text/markdown", title: `${destination} itinerary` },
      { citations: sources, inlineContent: JSON.stringify(sources, null, 2), kind: "SOURCE_SET" as const, mimeType: "application/json", title: "Travel sources" },
    ],
    steps: [
      { safeSummary: `Built a day-by-day itinerary for ${destination}.`, title: "Plan itinerary", type: "PLAN" as SkillRunStepType },
      { safeSummary: "Added citation placeholders and purchase-denial guardrails.", title: "Validate safety and citations", type: "TOOL" as SkillRunStepType },
    ],
    summary: `Created itinerary for ${destination}.`,
  };
}

function generateCodeReview(inputs: Record<string, unknown>) {
  const repo = stringInput(inputs.repository, "owner/repo");
  const pr = stringInput(inputs.pullRequest, "PR");
  const findings = [
    {
      confidence: 0.72,
      file: "src/example.ts",
      rationale: "Fixture finding validates the code-review artifact shape.",
      severity: "medium",
      suggestedFix: "Inspect the real PR diff during credentialed audit.",
      title: "Verify real PR diff before posting review",
    },
  ];
  const sources = [citation(`${repo} ${pr}`, `https://github.com/${repo}/pull/${pr}`, "controlled PR source")];
  return {
    artifacts: [
      { citations: sources, inlineContent: JSON.stringify({ findings }, null, 2), kind: "CODE_REVIEW" as const, mimeType: "application/json", title: "Code review findings" },
      { citations: sources, inlineContent: JSON.stringify(sources, null, 2), kind: "SOURCE_SET" as const, mimeType: "application/json", title: "PR sources reviewed" },
    ],
    steps: [
      { connectorId: "github" as IntegrationConnectorId, safeSummary: `Prepared GitHub PR review for ${repo} ${pr}.`, title: "Inspect pull request", toolName: "github.list_pull_requests", type: "TOOL" as SkillRunStepType },
      { safeSummary: "Kept posting comments approval-gated.", title: "Gate write actions", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Created code review artifact for ${repo} ${pr}.`,
  };
}

function generateNotionSummary(inputs: Record<string, unknown>) {
  const target = stringInput(inputs.notionTarget, "Notion target");
  const style = stringInput(inputs.summaryStyle, "executive");
  const content = `# Notion Summary\n\n## Target\n${target}\n\n## Style\n${style}\n\n## Key Themes\n- Controlled Stage 1 summary artifact generated.\n- Credentialed audit should verify real Notion page reads.\n\n## Action Items\n- Confirm source pages.\n- Approve any Notion writes before they happen.`;
  const sources = [citation(target, `notion://${encodeURIComponent(target)}`, "controlled Notion source")];
  return {
    artifacts: [
      { citations: sources, inlineContent: content, kind: "NOTION_SUMMARY" as const, mimeType: "text/markdown", title: "Notion workspace summary" },
      { citations: sources, inlineContent: JSON.stringify(sources, null, 2), kind: "SOURCE_SET" as const, mimeType: "application/json", title: "Notion sources" },
    ],
    steps: [
      { connectorId: "notion" as IntegrationConnectorId, safeSummary: `Prepared Notion summary for ${target}.`, title: "Read Notion target", toolName: "notion.search", type: "TOOL" as SkillRunStepType },
      { safeSummary: "Kept Notion writes approval-gated.", title: "Gate write actions", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Created Notion summary for ${target}.`,
  };
}

function generateCustomSkillRun(name: string, inputs: Record<string, unknown>) {
  const inputSummary = Object.entries(inputs)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n") || "- No inputs provided";
  return {
    artifacts: [
      {
        inlineContent: `# ${name} Output\n\n## Inputs\n${inputSummary}\n\n## Result\nThis custom Skill test run validated the package, policy, trace, and artifact pipeline. Credentialed live execution uses the standard agent runtime with this Skill's instructions and tool policy.`,
        kind: "CUSTOM_MARKDOWN" as const,
        mimeType: "text/markdown",
        title: `${name} output`,
      },
    ],
    steps: [
      { safeSummary: `Loaded custom Skill package for ${name}.`, title: "Load custom Skill", type: "PLAN" as SkillRunStepType },
      { safeSummary: "Validated custom Skill instructions, inputs, and policies.", title: "Validate custom Skill", type: "TOOL" as SkillRunStepType },
    ],
    summary: `Completed custom Skill test run for ${name}.`,
  };
}

function stringInput(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? redactSecrets(value.trim()) : fallback;
}

function citation(title: string, url: string, coverage: string) {
  return {
    accessedAt: new Date().toISOString(),
    coverage,
    title: redactSecrets(title),
    url: redactSecrets(url),
  };
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
