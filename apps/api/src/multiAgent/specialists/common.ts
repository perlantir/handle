import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpecialistRole, MultiAgentTraceEvent } from "@handle/shared";
import { logger } from "../../lib/logger";
import { redactSecrets } from "../../lib/redact";
import { isProviderId } from "../../providers/types";
import { parseSearchProviderId, webFetch, webSearch } from "../../search/searchProviderService";
import { consumeBudget, emitBudgetEvents } from "../budgets";
import { SPECIALIST_DEFINITIONS } from "../registry";
import { DEFAULT_APPROVAL_POLICY, mergeToolPolicies, strictestRuntimePolicy } from "../policies";
import type {
  BudgetSnapshot,
  MultiAgentRuntimeContext,
  SourceReference,
  SpecialistArtifact,
  SpecialistDefinition,
  SpecialistExecutionContext,
  SpecialistId,
  SpecialistReport,
  ToolPolicy,
} from "../types";

const currentDir = dirname(fileURLToPath(import.meta.url));
const promptDir = join(currentDir, "..", "prompts");

export async function loadSpecialistPrompt(id: SpecialistId) {
  return fs.readFile(join(promptDir, `${id}.md`), "utf8");
}

export function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function roleLabel(role: AgentSpecialistRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function messageToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item && "text" in item && typeof item.text === "string") return item.text;
      return "";
    }).join("");
  }
  return JSON.stringify(content);
}

export async function resolveSpecialistContext(
  runtime: MultiAgentRuntimeContext,
  definition: SpecialistDefinition,
  budget: BudgetSnapshot,
): Promise<Omit<SpecialistExecutionContext, "assignment">> {
  const taskOverride =
    runtime.project?.defaultProvider && isProviderId(runtime.project.defaultProvider)
      ? runtime.project.defaultProvider
      : undefined;
  const { model, provider } = await runtime.providerRegistry.getActiveModel({
    ...(runtime.project?.defaultModel ? { modelOverride: runtime.project.defaultModel } : {}),
    taskId: runtime.taskId,
    ...(taskOverride ? { taskOverride } : {}),
  });
  const effectiveToolPolicy = mergeToolPolicies(definition.toolPolicy);
  const effectiveRuntimePolicy = strictestRuntimePolicy(definition.runtimePolicy);
  return {
    ...runtime,
    budget,
    definition,
    effectiveApprovalPolicy: DEFAULT_APPROVAL_POLICY,
    effectiveRuntimePolicy,
    effectiveToolPolicy,
    llm: model,
    providerId: provider.id,
  };
}

export async function createSubRun({
  context,
}: {
  context: SpecialistExecutionContext;
}) {
  const startedAt = new Date();
  const subRun = await context.store.agentSubRun?.create({
    data: {
      agentRunId: context.taskId,
      goal: context.assignment.goal,
      inputs: {
        goal: redactSecrets(context.assignment.goal),
        toolPolicy: context.effectiveToolPolicy,
      },
      label: context.definition.label,
      role: context.definition.role,
      safeSummary: `${context.definition.label} started.`,
      startedAt,
      status: "RUNNING",
    },
  });
  context.emitEvent({
    event: "specialist_started",
    role: context.definition.role,
    summary: `${context.definition.label} started: ${context.assignment.rationale}`,
    taskId: context.taskId,
    timestamp: startedAt.toISOString(),
    type: "multi_agent_trace",
    ...(subRun?.id ? { subRunId: subRun.id } : {}),
  });
  return subRun?.id ?? null;
}

export async function completeSubRun({
  context,
  report,
  startedAt,
  subRunId,
  trace,
}: {
  context: SpecialistExecutionContext;
  report: SpecialistReport;
  startedAt: number;
  subRunId: string | null;
  trace: unknown[];
}) {
  const durationMs = Date.now() - startedAt;
  if (!subRunId) return;
  await context.store.agentSubRun?.update({
    data: {
      completedAt: new Date(),
      outputs: {
        artifacts: report.artifacts,
        blockers: report.blockers,
        findings: report.findings,
        recommendations: report.recommendations,
        sources: report.sources,
        status: report.status,
        summary: report.safeSummary,
      },
      role: context.definition.role,
      safeSummary: report.safeSummary,
      status: report.status === "completed" ? "COMPLETED" : report.status === "failed" ? "FAILED" : "REVISED",
      toolCallCount: report.toolCallCount,
      trace,
    },
    where: { id: subRunId },
  }).catch((err) => {
    logger.warn({ err, role: context.definition.role, taskId: context.taskId }, "Failed to update specialist subrun");
  });
  context.emitEvent({
    event: "specialist_completed",
    metadata: { durationMs, findings: report.findings.length, sources: report.sources.length, toolCallCount: report.toolCallCount },
    role: context.definition.role,
    summary: report.safeSummary,
    taskId: context.taskId,
    timestamp: new Date().toISOString(),
    type: "multi_agent_trace",
    ...(subRunId ? { subRunId } : {}),
  });
}

export async function gatherResearchSources({
  context,
  maxResults = 6,
  query,
}: {
  context: SpecialistExecutionContext;
  maxResults?: number;
  query: string;
}) {
  if (!context.userId) return { sources: [] as SourceReference[], toolCallCount: 0 };
  const providerId = parseSearchProviderId(process.env.HANDLE_SEARCH_PROVIDER);
  const searched = await webSearch({
    maxResults,
    ...(context.project?.id ? { projectId: context.project.id } : {}),
    ...(providerId ? { providerId } : {}),
    query,
    userId: context.userId,
  });
  const accessedAt = new Date().toISOString();
  const sources: SourceReference[] = searched.results.map((result) => ({
    accessedAt,
    domain: sourceDomain(result.url),
    ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
    snippet: result.snippet,
    title: result.title,
    url: result.url,
  }));
  const fetchTargets = sources.slice(0, 2);
  for (const source of fetchTargets) {
    const fetched = await webFetch({ maxBytes: 12_000, url: source.url }).catch(() => null);
    if (fetched?.content) {
      source.snippet = `${source.snippet ?? ""}\n\nFetched excerpt: ${fetched.content.slice(0, 2000)}`.trim();
    }
  }
  return { sources, toolCallCount: 1 + fetchTargets.length };
}

export async function runLlmReport({
  context,
  extraContext = "",
  prompt,
  sources = [],
}: {
  context: SpecialistExecutionContext;
  extraContext?: string | undefined;
  prompt: string;
  sources?: SourceReference[];
}) {
  const sourceContext = sources
    .map((source, index) => `[S${index + 1}] ${source.title}\nURL: ${source.url}\nDomain: ${source.domain}\nPublished: ${source.publishedAt ?? "unknown"}\nAccessed: ${source.accessedAt}\nExcerpt: ${(source.snippet ?? "").slice(0, 1800)}`)
    .join("\n\n");
  const response = await context.llm.invoke([
    new SystemMessage(prompt),
    new HumanMessage(
      [
        `Original user goal:\n${redactSecrets(context.goal)}`,
        `Specialist assignment:\n${redactSecrets(context.assignment.goal)}`,
        extraContext ? `Context from prior specialists:\n${redactSecrets(extraContext)}` : "",
        sourceContext ? `Sources:\n${redactSecrets(sourceContext)}` : "Sources: none available. Do not invent citations.",
        "Return a concise structured Markdown report with Summary, Findings, Recommendations, Blockers, Sources Used.",
      ].filter(Boolean).join("\n\n"),
    ),
  ]);
  return redactSecrets(messageToText(response.content));
}

export function reportFromMarkdown({
  artifactKind,
  content,
  context,
  sources,
  status = "completed",
  toolCallCount,
}: {
  artifactKind: SpecialistArtifact["kind"];
  content: string;
  context: SpecialistExecutionContext;
  sources: SourceReference[];
  status?: SpecialistReport["status"];
  toolCallCount: number;
}): SpecialistReport {
  const findings = content
    .split("\n")
    .filter((line) => /^[-*]\s+/.test(line.trim()))
    .slice(0, 8)
    .map((line) => line.replace(/^[-*]\s+/, "").trim());
  return {
    artifactIds: [`${context.assignment.id}-artifact`],
    artifacts: [
      {
        content,
        kind: artifactKind,
        mimeType: "text/markdown",
        title: `${context.definition.label} report`,
      },
    ],
    blockers: /no sources|unavailable|blocked|could not/i.test(content) ? ["Some requested evidence or execution context was unavailable."] : [],
    costCents: 1,
    findings,
    recommendations: findings.slice(0, 3),
    role: context.definition.role,
    safeSummary: `${context.definition.label} completed with ${findings.length || 1} finding(s) and ${sources.length} source(s).`,
    sources,
    status,
    toolCallCount,
  };
}

export function emitAndCheckBudget(context: SpecialistExecutionContext, usage: Parameters<typeof consumeBudget>[1]) {
  context.budget = consumeBudget(context.budget, usage);
  return emitBudgetEvents({ emitEvent: context.emitEvent, snapshot: context.budget, taskId: context.taskId });
}

export async function executeGenericSpecialist({
  artifactKind,
  context,
  extraContext,
  searchQuery,
}: {
  artifactKind: SpecialistArtifact["kind"];
  context: SpecialistExecutionContext;
  extraContext?: string;
  searchQuery?: string | undefined;
}) {
  const startedAt = Date.now();
  const subRunId = await createSubRun({ context });
  const prompt = await loadSpecialistPrompt(context.definition.id);
  let sources: SourceReference[] = [];
  let toolCallCount = 0;
  if (searchQuery && context.effectiveRuntimePolicy.maxToolCalls > 0) {
    const gathered = await gatherResearchSources({ context, query: searchQuery }).catch((err) => {
      logger.warn({ err, role: context.definition.role, taskId: context.taskId }, "Specialist source gathering failed");
      return { sources: [] as SourceReference[], toolCallCount: 0 };
    });
    sources = gathered.sources;
    toolCallCount += gathered.toolCallCount;
  }
  const content = await runLlmReport({
    context,
    ...(extraContext !== undefined ? { extraContext } : {}),
    prompt,
    sources,
  });
  const report = reportFromMarkdown({
    artifactKind,
    content,
    context,
    sources,
    toolCallCount: toolCallCount + 1,
  });
  emitAndCheckBudget(context, { costCents: report.costCents, specialistSubRuns: 1, toolCalls: report.toolCallCount });
  await completeSubRun({ context, report, startedAt, subRunId, trace: [{ at: new Date().toISOString(), content: report.safeSummary }] });
  return report;
}

export function definitionFor(id: SpecialistId) {
  return SPECIALIST_DEFINITIONS[id];
}

export type SpecialistExecutor = (context: SpecialistExecutionContext, extraContext?: string) => Promise<SpecialistReport>;
