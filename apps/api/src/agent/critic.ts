import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CriticInterventionScope, CriticVerdict } from "@handle/shared";
import { appendActionLog } from "../lib/actionLog";
import { appendAuditEvent } from "../lib/auditLog";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import type { TrajectoryStepRecord } from "../memory/trajectoryMemory";

export const CRITIC_PROMPT_VERSION = "critic_prompt_v1";

export type CriticInterventionPoint =
  | "post-plan-before-execute"
  | "post-code-before-run"
  | "post-tool-result-before-next-step";

export interface CriticProjectSettings {
  criticEnabled?: boolean | null;
  criticMaxRevisions?: number | null;
  criticModel?: string | null;
  criticScope?: string | null;
  id?: string | null;
}

export interface CriticReviewResult {
  createdAt?: string;
  id?: string;
  interventionPoint: CriticInterventionPoint;
  metadata?: Record<string, unknown>;
  reasoning: string;
  verdict: CriticVerdict;
}

export interface CriticReviewStore {
  criticReview?: {
    create(args: unknown): Promise<unknown>;
  };
}

export class CriticRejectedError extends Error {
  review: CriticReviewResult;

  constructor(review: CriticReviewResult) {
    super(`Critic rejected the next action: ${review.reasoning}`);
    this.name = "CriticRejectedError";
    this.review = review;
  }
}

export function isCriticRejectedError(err: unknown): err is CriticRejectedError {
  return err instanceof CriticRejectedError;
}

export function normalizeCriticScope(value: string | null | undefined): CriticInterventionScope {
  if (value === "all" || value === "writes-only" || value === "risky-only") return value;
  return "risky-only";
}

export function criticEnabled(project: CriticProjectSettings | null | undefined) {
  return project?.criticEnabled === true;
}

export function shouldCriticReviewToolStep({
  project,
  step,
}: {
  project: CriticProjectSettings | null | undefined;
  step: TrajectoryStepRecord;
}) {
  if (!criticEnabled(project)) return false;
  const scope = normalizeCriticScope(project?.criticScope);
  if (scope === "all") return true;
  if (scope === "writes-only") {
    return /write|create|update|delete|send|copy|shell_exec|exec/i.test(step.toolName);
  }
  return /write|delete|send|shell_exec|browser_click|computer_use|integration/i.test(step.toolName);
}

function parseVerdict(text: string): CriticVerdict {
  const match = text.match(/\b(APPROVE|REVISE|REJECT)\b/i);
  if (!match) return "REVISE";
  return match[1]?.toUpperCase() as CriticVerdict;
}

function trimReasoning(text: string) {
  return redactSecrets(text.trim()).slice(0, 2_000);
}

export function formatCriticFeedback(review: CriticReviewResult) {
  if (review.verdict === "APPROVE") return "";
  return [
    "<critic_feedback>",
    `Intervention: ${review.interventionPoint}`,
    `Verdict: ${review.verdict}`,
    `Reasoning: ${review.reasoning}`,
    "</critic_feedback>",
  ].join("\n");
}

export async function runCriticReview({
  agentRunId,
  conversationId,
  goal,
  interventionPoint,
  llm,
  metadata = {},
  project,
  store = prisma,
}: {
  agentRunId: string;
  conversationId: string;
  goal: string;
  interventionPoint: CriticInterventionPoint;
  llm: BaseChatModel;
  metadata?: Record<string, unknown>;
  project: CriticProjectSettings | null | undefined;
  store?: CriticReviewStore;
}): Promise<CriticReviewResult> {
  const serializedMetadata = JSON.stringify(redactUnknown(metadata)).slice(0, 8_000);
  const response = await llm.invoke([
    new SystemMessage(
      [
        `Critic prompt version: ${CRITIC_PROMPT_VERSION}`,
        "You are Handle's opt-in critic/verifier. Review the immediate decision point only.",
        "Return one verdict word first: APPROVE, REVISE, or REJECT.",
        "APPROVE means the agent can proceed.",
        "REVISE means the agent should adjust the plan or next step before continuing.",
        "REJECT means the trajectory should halt and surface your reasoning to the user.",
        "Be strict about safety, data loss, secrets, unsupported assumptions, and unverifiable claims.",
      ].join("\n"),
    ),
    new HumanMessage(
      [
        `Goal: ${redactSecrets(goal)}`,
        `Intervention point: ${interventionPoint}`,
        "Context:",
        serializedMetadata,
      ].join("\n"),
    ),
  ]);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  const review: CriticReviewResult = {
    interventionPoint,
    reasoning: trimReasoning(content.replace(/\b(APPROVE|REVISE|REJECT)\b[:\s-]*/i, "")),
    verdict: parseVerdict(content),
  };

  const persistedReview = await store.criticReview?.create({
    data: {
      agentRunId,
      interventionPoint,
      metadata: redactUnknown(metadata),
      projectId: project?.id ?? null,
      reasoning: review.reasoning,
      verdict: review.verdict,
    },
  });
  const persisted =
    persistedReview && typeof persistedReview === "object"
      ? (persistedReview as { createdAt?: Date | string; id?: string })
      : null;
  if (persisted?.id) review.id = persisted.id;
  if (persisted?.createdAt) {
    review.createdAt =
      persisted.createdAt instanceof Date
        ? persisted.createdAt.toISOString()
        : persisted.createdAt;
  }
  review.metadata = redactUnknown(metadata) as Record<string, unknown>;

  await appendActionLog({
    conversationId,
    description: `Critic reviewed ${interventionPoint}: ${review.verdict}`,
    metadata: {
      interventionPoint,
      promptVersion: CRITIC_PROMPT_VERSION,
      verdict: review.verdict,
    },
    outcomeType: "critic_reviewed",
    projectId: project?.id ?? "unknown",
    reversible: false,
    target: interventionPoint,
    taskId: agentRunId,
    timestamp: new Date().toISOString(),
  }).catch(() => undefined);
  await appendAuditEvent({
    cycle: Number((metadata as { cycle?: unknown }).cycle ?? 1),
    event: "critic_verdict",
    intervention: interventionPoint,
    reasoning: review.reasoning,
    taskId: agentRunId,
    verdict: review.verdict,
  }).catch(() => undefined);

  return review;
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]),
    );
  }
  return value;
}
