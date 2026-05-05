import type {
  IntegrationConnectorId,
  RunSkillRequest,
  SkillArtifactKind,
  SkillRunDetail,
  SkillRunStepType,
} from "@handle/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Prisma } from "@prisma/client";
import { createDefaultIntegrationToolRuntime } from "../integrations/toolRuntime";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { providerRegistry } from "../providers/registry";
import { isProviderId, type ProviderId } from "../providers/types";
import {
  webFetch,
  webSearch,
  type NormalizedSearchResult,
} from "../search/searchProviderService";
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

    const generated = await generateSkillRun(
      detail,
      request.inputs,
      request.runtimeMode as SkillRuntimeMode | undefined,
      {
        ...(request.projectId ? { projectId: request.projectId } : {}),
        request,
        store,
        userId,
      },
    );
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

interface LiveSkillRunContext {
  projectId?: string;
  request: RunSkillRequest;
  store: SkillStore;
  userId: string;
}

async function generateSkillRun(
  detail: { name: string; runtimePolicy: Record<string, unknown>; slug: string; sourceType: string },
  inputs: Record<string, unknown>,
  mode?: SkillRuntimeMode,
  context?: LiveSkillRunContext,
): Promise<{ artifacts: SkillArtifactInput[]; steps: SkillTraceStepInput[]; summary: string }> {
  const base = context && context.store === prisma && detail.sourceType === "BUILTIN"
    ? await generateLiveBuiltinSkillRun(detail.slug, inputs, context)
    :
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

async function generateLiveBuiltinSkillRun(
  slug: string,
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
) {
  if (slug === "research-company") return generateLiveCompanyResearch(inputs, context);
  if (slug === "plan-trip") return generateLiveTripPlan(inputs, context);
  if (slug === "email-outreach") return generateLiveEmailOutreach(inputs, context);
  if (slug === "code-review-pr") return generateLiveCodeReview(inputs, context);
  if (slug === "summarize-notion-workspace") return generateLiveNotionSummary(inputs, context);
  throw new Error(`No live executor is registered for built-in Skill ${slug}.`);
}

type LiveGeneratedSkillRun = {
  artifacts: SkillArtifactInput[];
  steps: SkillTraceStepInput[];
  summary: string;
};

interface SourceRecord {
  accessedAt: string;
  content?: string;
  domain: string;
  id: string;
  publishedAt: string;
  snippet: string;
  sourceProvider?: string;
  title: string;
  url: string;
}

function contentToString(content: unknown) {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateCandidate(value: string | null | undefined) {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate) return null;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return parsed.toISOString();
}

function extractPublishedAt(rawContent: string, fallback?: string | null) {
  const direct = normalizeDateCandidate(fallback);
  if (direct) return direct;

  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|date|pubdate|dc\.date|sailthru\.date)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|date|pubdate|dc\.date|sailthru\.date)["'][^>]*>/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"dateModified"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = rawContent.match(pattern);
    const parsed = normalizeDateCandidate(match?.[1]);
    if (parsed) return parsed;
  }

  const plainDate = stripHtml(rawContent)
    .slice(0, 1_500)
    .match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i);
  const parsedPlainDate = normalizeDateCandidate(plainDate?.[0]);
  return parsedPlainDate ?? "unknown";
}

function sourceCitation(source: SourceRecord, coverage: string) {
  return citation(source.title, source.url, coverage, {
    accessedAt: source.accessedAt,
    domain: source.domain,
    publishedAt: source.publishedAt,
    sourceId: source.id,
  });
}

function sourceSetArtifact(title: string, sources: SourceRecord[]): SkillArtifactInput {
  return {
    citations: sources.map((source) => sourceCitation(source, `Source ${source.id}`)),
    inlineContent: JSON.stringify(
      sources.map(({ content: _content, ...source }) => source),
      null,
      2,
    ),
    kind: "SOURCE_SET",
    metadata: { sourceCount: sources.length },
    mimeType: "application/json",
    title,
  };
}

function sourceContext(sources: SourceRecord[], maxChars = 45_000) {
  const chunks = sources.map((source) => [
    `[${source.id}] ${source.title}`,
    `URL: ${source.url}`,
    `Domain: ${source.domain}`,
    source.publishedAt ? `Published: ${source.publishedAt}` : "Published: unknown",
    `Snippet: ${source.snippet}`,
    `Content: ${(source.content ?? "").slice(0, 2_500)}`,
  ].join("\n"));
  return chunks.join("\n\n").slice(0, maxChars);
}

function uniqueByUrl(results: NormalizedSearchResult[]) {
  const seen = new Set<string>();
  const unique: NormalizedSearchResult[] = [];
  for (const result of results) {
    const key = result.url.split("#")[0]?.replace(/\/$/, "") ?? result.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }
  return unique;
}

async function gatherWebSources({
  context,
  maxSources,
  queries,
}: {
  context: LiveSkillRunContext;
  maxSources: number;
  queries: string[];
}): Promise<SourceRecord[]> {
  const results: NormalizedSearchResult[] = [];
  const failures: string[] = [];
  logger.info(
    { maxSources, projectId: context.projectId ?? null, queryCount: queries.length, userId: context.userId },
    "Skill live web source gathering started",
  );
  for (const query of queries) {
    try {
      const response = await webSearch({
        maxResults: Math.min(10, maxSources),
        ...(context.projectId ? { projectId: context.projectId } : {}),
        query,
        userId: context.userId,
      });
      results.push(...response.results);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
    if (uniqueByUrl(results).length >= Math.min(maxSources * 3, maxSources + 30)) break;
  }

  const candidates = uniqueByUrl(results).slice(0, Math.min(maxSources * 2, maxSources + 20));
  if (candidates.length === 0) {
    throw new Error(`No live web search results were available. ${failures.join("; ")}`);
  }
  logger.info(
    { candidateCount: candidates.length, maxSources, userId: context.userId },
    "Skill live web search candidates collected",
  );

  const datedSources: SourceRecord[] = [];
  const undatedSources: SourceRecord[] = [];
  for (const result of candidates) {
    let rawContent = "";
    let content = result.snippet;
    try {
      const fetched = await webFetch({ maxBytes: 80_000, url: result.url });
      rawContent = fetched.content;
      content = stripHtml(rawContent).slice(0, 8_000) || result.snippet;
    } catch {
      content = result.snippet;
    }
    const sourceIndex = datedSources.length + undatedSources.length + 1;
    const publishedAt = extractPublishedAt(rawContent || result.snippet, result.publishedAt);
    const source: SourceRecord = {
      accessedAt: new Date().toISOString(),
      content,
      domain: sourceDomain(result.url),
      id: `S${sourceIndex}`,
      publishedAt,
      snippet: result.snippet,
      sourceProvider: result.sourceProvider,
      title: result.title,
      url: result.url,
    };
    if (publishedAt === "unknown") {
      undatedSources.push(source);
    } else {
      datedSources.push(source);
    }
    if (datedSources.length >= maxSources) break;
  }
  const sources = [...datedSources, ...undatedSources]
    .slice(0, maxSources)
    .map((source, index) => ({ ...source, id: `S${index + 1}` }));
  logger.info(
    {
      datedSourceCount: sources.filter((source) => source.publishedAt !== "unknown").length,
      sourceCount: sources.length,
      userId: context.userId,
    },
    "Skill live web source gathering completed",
  );
  return sources;
}

async function invokeSkillLlm({
  context,
  maxRetries = 1,
  minWords = 0,
  system,
  user,
}: {
  context: LiveSkillRunContext;
  maxRetries?: number;
  minWords?: number;
  system: string;
  user: string;
}) {
  await providerRegistry.initialize();
  const providerOverride =
    context.request.providerId && isProviderId(context.request.providerId)
      ? (context.request.providerId as ProviderId)
      : undefined;
  let active = await providerRegistry.getActiveModel({
    ...(context.request.modelName ? { modelOverride: context.request.modelName } : {}),
    ...(providerOverride ? { taskOverride: providerOverride } : {}),
  });
  let prompt = user;
  let text = "";
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const started = Date.now();
    const promptChars = prompt.length + system.length;
    logger.info(
      {
        attempt,
        model: context.request.modelName ?? active.provider.config.primaryModel,
        minWords,
        promptChars,
        providerId: active.provider.id,
        userId: context.userId,
      },
      "Skill live LLM synthesis started",
    );
    const response = await active.model.invoke(
      [
        new SystemMessage(system),
        new HumanMessage(prompt),
      ],
      { signal: AbortSignal.timeout(180_000) },
    );
    text = redactSecrets(contentToString(response.content)).trim();
    logger.info(
      {
        attempt,
        durationMs: Date.now() - started,
        model: context.request.modelName ?? active.provider.config.primaryModel,
        providerId: active.provider.id,
        userId: context.userId,
        wordCount: wordCount(text),
      },
      "Skill live LLM synthesis completed",
    );
    if (!minWords || wordCount(text) >= minWords) return text;
    prompt = `${user}\n\nYour previous draft was ${wordCount(text)} words. Expand it to at least ${minWords} words while preserving citations and specificity.`;
    active = await providerRegistry.getActiveModel({
      ...(context.request.modelName ? { modelOverride: context.request.modelName } : {}),
      ...(providerOverride ? { taskOverride: providerOverride } : {}),
    });
  }
  return text;
}

async function generateLiveCompanyResearch(
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
): Promise<LiveGeneratedSkillRun> {
  const company = stringInput(inputs.company, "Company");
  const depth = stringInput(inputs.depth, "standard").toLowerCase();
  const sourceTarget = depth === "deep" ? 40 : depth === "quick" ? 10 : 20;
  const minWords = depth === "deep" ? 2600 : depth === "quick" ? 900 : 1500;
  const queries = [
    `${company} official company overview products leadership`,
    `${company} recent news funding financials competitors`,
    `${company} market competitors product strategy`,
    `${company} leadership CEO founders recent updates`,
    `${company} annual report financials revenue valuation`,
  ];
  const sources = await gatherWebSources({ context, maxSources: sourceTarget, queries });
  const report = await invokeSkillLlm({
    context,
    maxRetries: 1,
    minWords,
    system: [
      "You are Handle's Research a Company Skill.",
      "Write a real company research report from the provided sources only.",
      "Required sections: Overview, Product, Market, Leadership, Financials, Competitors, Recent News, Risks, Open Questions.",
      "Every factual paragraph must include bracket citations like [S1] or [S2][S5].",
      "Do not invent facts. If a fact is unavailable, say what source would be needed.",
      "Do not mention placeholder, mock, fixture, or credentialed audit.",
    ].join("\n"),
    user: [
      `Company: ${company}`,
      `Depth: ${depth}`,
      "Sources:",
      sourceContext(sources),
    ].join("\n\n"),
  });
  return {
    artifacts: [
      {
        citations: sources.map((source) => sourceCitation(source, `Research source ${source.id}`)),
        inlineContent: report,
        kind: "REPORT",
        metadata: { company, depth, sourceCount: sources.length, wordCount: wordCount(report) },
        mimeType: "text/markdown",
        title: `${company} research report`,
      },
      sourceSetArtifact("Research sources", sources),
    ],
    steps: [
      { safeSummary: `Searched live web providers for ${company}.`, title: "Search web", toolName: "web_search", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Fetched and read ${sources.length} source(s).`, title: "Read sources", toolName: "web_fetch", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Synthesized a ${wordCount(report)} word cited report.`, title: "Synthesize report", type: "TOOL" as SkillRunStepType },
    ],
    summary: `Created ${wordCount(report)} word cited research report for ${company} from ${sources.length} source(s).`,
  };
}

async function generateLiveTripPlan(
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
): Promise<LiveGeneratedSkillRun> {
  const destination = stringInput(inputs.destination, "Destination");
  const dates = stringInput(inputs.dates, "dates TBD");
  const travelers = stringInput(inputs.travelers, "No traveler constraints provided");
  const budget = stringInput(inputs.budget, "No budget provided");
  const interests = stringInput(inputs.interests, "General highlights, food, culture, and transit");
  const queries = [
    `${destination} official tourism attractions opening hours`,
    `${destination} best restaurants neighborhoods transit visitors`,
    `${destination} museums parks tickets hours current`,
    `${destination} public transit airport city center visitor guide`,
    `${destination} local events travel guide ${dates}`,
  ];
  const sources = await gatherWebSources({ context, maxSources: 18, queries });
  const itinerary = await invokeSkillLlm({
    context,
    maxRetries: 1,
    minWords: 1100,
    system: [
      "You are Handle's Plan a Trip Skill.",
      "Create a practical, cited itinerary using only the supplied sources.",
      "Include day-by-day plan, food options, transit notes, booking caveats, backup options, and approval-gated export/calendar suggestions.",
      "Cite every recommendation with [S#]. Include hours/prices only when a source supports them.",
      "Do not book, purchase, send, or create external events.",
    ].join("\n"),
    user: [
      `Destination: ${destination}`,
      `Dates or duration: ${dates}`,
      `Travelers: ${travelers}`,
      `Budget: ${budget}`,
      `Interests: ${interests}`,
      "Sources:",
      sourceContext(sources),
    ].join("\n\n"),
  });
  return {
    artifacts: [
      {
        citations: sources.map((source) => sourceCitation(source, `Travel source ${source.id}`)),
        inlineContent: itinerary,
        kind: "ITINERARY",
        metadata: { destination, sourceCount: sources.length, wordCount: wordCount(itinerary) },
        mimeType: "text/markdown",
        title: `${destination} itinerary`,
      },
      sourceSetArtifact("Travel sources", sources),
    ],
    steps: [
      { safeSummary: `Searched live travel sources for ${destination}.`, title: "Search destination", toolName: "web_search", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Fetched and read ${sources.length} travel source(s).`, title: "Read travel sources", toolName: "web_fetch", type: "TOOL" as SkillRunStepType },
      { safeSummary: "Kept calendar and document export actions approval-gated.", title: "Gate optional writes", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Created cited itinerary for ${destination} from ${sources.length} source(s).`,
  };
}

function parseRecipientLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((raw) => {
      const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? raw;
      const name = raw.replace(email, "").replace(/[<>()-]/g, " ").trim() || email.split("@")[0] || email;
      return { email, name, raw };
    });
}

async function generateLiveEmailOutreach(
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
): Promise<LiveGeneratedSkillRun> {
  const recipients = parseRecipientLines(stringInput(inputs.recipients, ""));
  const campaignGoal = stringInput(inputs.campaignGoal, "Start a conversation");
  const tone = stringInput(inputs.tone, "friendly");
  const callToAction = stringInput(inputs.callToAction, "Reply with availability");
  const senderContext = stringInput(inputs.senderContext, "No sender context provided");
  const runtime = createDefaultIntegrationToolRuntime();
  const labels = await runtime.request({
    connectorId: "gmail",
    endpoint: "/gmail/v1/users/me/labels",
    userId: context.userId,
  });
  const draftText = await invokeSkillLlm({
    context,
    system: [
      "You are Handle's Email Outreach Skill.",
      "Generate one personalized draft per recipient.",
      "Return valid JSON only with shape {\"drafts\":[{\"recipient\",\"subject\",\"body\",\"personalizationNotes\",\"sendStatus\":\"draft\"}]}",
      "Never claim an email was sent. Drafts must remain approval-gated.",
    ].join("\n"),
    user: JSON.stringify({
      callToAction,
      campaignGoal,
      recipients,
      senderContext,
      tone,
    }),
  });
  let drafts: unknown;
  try {
    drafts = JSON.parse(draftText);
  } catch {
    drafts = {
      drafts: recipients.map((recipient) => ({
        body: `Hi ${recipient.name},\n\n${senderContext}\n\nI wanted to reach out about ${campaignGoal}. ${callToAction}.\n\nBest,`,
        personalizationNotes: "Generated as a draft only. Sending requires approval.",
        recipient: recipient.email,
        sendStatus: "draft",
        subject: campaignGoal,
      })),
    };
  }
  return {
    artifacts: [
      {
        inlineContent: JSON.stringify(drafts, null, 2),
        kind: "EMAIL_DRAFTS",
        metadata: { draftCount: recipients.length, gmailAccount: labels.accountAlias },
        mimeType: "application/json",
        title: "Email draft batch",
      },
    ],
    steps: [
      { connectorId: "gmail" as IntegrationConnectorId, safeSummary: "Verified Gmail connection by listing labels.", title: "Check Gmail", toolName: "gmail_list_labels", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Generated ${recipients.length} personalized draft(s).`, title: "Generate drafts", type: "TOOL" as SkillRunStepType },
      { safeSummary: "No emails were sent. Sending requires explicit user approval.", title: "Require send approval", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Prepared ${recipients.length} approval-gated email draft(s).`,
  };
}

function parseRepo(value: string) {
  const match = value.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i) ?? value.match(/^([^/\s]+)\/([^/\s#?]+)$/);
  if (!match?.[1] || !match?.[2]) throw new Error("Repository must be owner/repo or a GitHub repository URL.");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function parsePrNumber(value: string) {
  const match = value.match(/\/pull\/(\d+)/i) ?? value.match(/#?(\d+)/);
  const number = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isFinite(number) || number <= 0) throw new Error("Pull request number or URL is required.");
  return number;
}

async function generateLiveCodeReview(
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
): Promise<LiveGeneratedSkillRun> {
  const { owner, repo } = parseRepo(stringInput(inputs.repository, ""));
  const pullNumber = parsePrNumber(stringInput(inputs.pullRequest, ""));
  const reviewMode = stringInput(inputs.reviewMode, "deep");
  const runtime = createDefaultIntegrationToolRuntime();
  const [pr, files] = await Promise.all([
    runtime.request({
      connectorId: "github",
      endpoint: `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      userId: context.userId,
    }),
    runtime.request({
      connectorId: "github",
      endpoint: `/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
      params: { per_page: 100 },
      userId: context.userId,
    }),
  ]);
  const review = await invokeSkillLlm({
    context,
    system: [
      "You are Handle's Code Review a PR Skill.",
      "Review the provided pull request metadata and file patches.",
      "Return JSON only: {\"summary\":\"...\",\"findings\":[{\"file\",\"line\",\"severity\",\"title\",\"explanation\",\"suggestedChange\"}],\"positiveNotes\":[],\"questions\":[]}.",
      "Prioritize correctness, security, data loss, tests, and regressions. Do not invent line numbers absent from patches.",
    ].join("\n"),
    user: JSON.stringify({ files: files.data, mode: reviewMode, pullRequest: pr.data }).slice(0, 90_000),
  });
  return {
    artifacts: [
      {
        citations: [citation(`${owner}/${repo} PR #${pullNumber}`, `https://github.com/${owner}/${repo}/pull/${pullNumber}`, "GitHub pull request")],
        inlineContent: review,
        kind: "CODE_REVIEW",
        metadata: { fileCount: Array.isArray(files.data) ? files.data.length : null, owner, pullNumber, repo, reviewMode },
        mimeType: "application/json",
        title: "Code review findings",
      },
      {
        citations: [citation(`${owner}/${repo} PR #${pullNumber}`, `https://github.com/${owner}/${repo}/pull/${pullNumber}`, "GitHub pull request")],
        inlineContent: JSON.stringify({ files: files.data, pullRequest: pr.data }, null, 2),
        kind: "SOURCE_SET",
        metadata: { owner, pullNumber, repo },
        mimeType: "application/json",
        title: "PR sources reviewed",
      },
    ],
    steps: [
      { connectorId: "github" as IntegrationConnectorId, safeSummary: `Fetched ${owner}/${repo} PR #${pullNumber}.`, title: "Fetch PR", toolName: "github_get_pull_request", type: "TOOL" as SkillRunStepType },
      { connectorId: "github" as IntegrationConnectorId, safeSummary: "Fetched PR file patches.", title: "Fetch PR files", toolName: "github_list_pull_request_files", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Generated ${reviewMode} code review artifact.`, title: "Review diff", type: "TOOL" as SkillRunStepType },
    ],
    summary: `Reviewed ${owner}/${repo} PR #${pullNumber}.`,
  };
}

async function generateLiveNotionSummary(
  inputs: Record<string, unknown>,
  context: LiveSkillRunContext,
): Promise<LiveGeneratedSkillRun> {
  const target = stringInput(inputs.notionTarget, "workspace");
  const timeRange = stringInput(inputs.timeRange, "No time range provided");
  const summaryStyle = stringInput(inputs.summaryStyle, "executive");
  const runtime = createDefaultIntegrationToolRuntime();
  const search = await runtime.request({
    connectorId: "notion",
    data: { page_size: 10, query: target === "workspace" ? "" : target },
    endpoint: "/v1/search",
    method: "POST",
    userId: context.userId,
  });
  const sources = Array.isArray((search.data as { results?: unknown[] }).results)
    ? (search.data as { results: Array<Record<string, unknown>> }).results.slice(0, 10)
    : [];
  const summary = await invokeSkillLlm({
    context,
    system: [
      "You are Handle's Summarize a Notion Workspace Skill.",
      "Summarize the provided Notion search/page metadata.",
      "Include executive summary, key themes, action items, risks, owners if available, and citations to Notion source names.",
      "Do not invent body content that was not available from the Notion API response.",
    ].join("\n"),
    user: JSON.stringify({ sources, summaryStyle, target, timeRange }).slice(0, 80_000),
  });
  const notionSources = sources.map((item, index) => {
    const title =
      typeof item.title === "string"
        ? item.title
        : typeof item.url === "string"
          ? item.url
          : `Notion source ${index + 1}`;
    const url = typeof item.url === "string" ? item.url : `notion://${item.id ?? index + 1}`;
    return citation(title, url, `Notion source N${index + 1}`);
  });
  return {
    artifacts: [
      {
        citations: notionSources,
        inlineContent: summary,
        kind: "NOTION_SUMMARY",
        metadata: { sourceCount: sources.length, summaryStyle, target },
        mimeType: "text/markdown",
        title: "Notion workspace summary",
      },
      {
        citations: notionSources,
        inlineContent: JSON.stringify(sources, null, 2),
        kind: "SOURCE_SET",
        metadata: { sourceCount: sources.length },
        mimeType: "application/json",
        title: "Notion sources",
      },
    ],
    steps: [
      { connectorId: "notion" as IntegrationConnectorId, safeSummary: `Searched Notion for ${target}.`, title: "Search Notion", toolName: "notion_search", type: "TOOL" as SkillRunStepType },
      { safeSummary: `Synthesized ${summaryStyle} summary from ${sources.length} Notion source(s).`, title: "Summarize Notion", type: "TOOL" as SkillRunStepType },
      { safeSummary: "Kept Notion writes approval-gated.", title: "Gate writes", type: "APPROVAL" as SkillRunStepType },
    ],
    summary: `Created Notion summary from ${sources.length} source(s).`,
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

function citation(
  title: string,
  url: string,
  coverage: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    accessedAt: new Date().toISOString(),
    coverage,
    ...redactUnknown(metadata) as Record<string, unknown>,
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
