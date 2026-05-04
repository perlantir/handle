import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PlanStep } from "@handle/shared";
import { emitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";
import { createOpenAIChatModel } from "./createAgent";

export const PLANNER_PROMPT_VERSION = "plan_prompt_v1";

const planResponseSchema = z.union([
  z.array(z.string()),
  z.object({
    steps: z.array(z.string()),
  }),
]);

function contentToString(content: unknown) {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);

  if (fenced?.[1]) return fenced[1].trim();

  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  const starts = [arrayStart, objectStart].filter((index) => index >= 0);

  if (starts.length === 0) return trimmed;

  const start = Math.min(...starts);
  const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));

  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

interface ParsedPlan {
  parseError?: unknown;
  steps: PlanStep[];
  usedFallback: boolean;
}

function parseJsonPlanSteps(responseText: string): PlanStep[] {
  const parsed = planResponseSchema.parse(JSON.parse(extractJson(responseText)));
  const steps = Array.isArray(parsed) ? parsed : parsed.steps;

  return steps.slice(0, 7).map((title, index) => ({
    id: `plan-${index + 1}`,
    state: "pending",
    title,
  }));
}

function fallbackPlanSteps(responseText: string): PlanStep[] {
  const cleaned = responseText
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/^["']|["']$/g, ""),
    )
    .filter((line) => line.length >= 3 && line.length <= 120)
    .filter((line) => !line.includes("[[HANDLE_RESULT"));
  const titles = cleaned.length
    ? cleaned.slice(0, 7)
    : ["Understand the request", "Complete the task", "Verify the result"];

  return titles.map((title, index) => ({
    id: `plan-${index + 1}`,
    state: "pending",
    title,
  }));
}

export function parsePlanStepsDetailed(responseText: string): ParsedPlan {
  try {
    return { steps: parseJsonPlanSteps(responseText), usedFallback: false };
  } catch (err) {
    return {
      parseError: err,
      steps: fallbackPlanSteps(responseText),
      usedFallback: true,
    };
  }
}

export function parsePlanSteps(responseText: string): PlanStep[] {
  return parsePlanStepsDetailed(responseText).steps;
}

export interface EmitInitialPlanOptions {
  llm?: BaseChatModel;
  provider?: {
    id: string;
    model: string;
  };
  signal?: AbortSignal;
}

function truncateForLog(value: string, maxLength = 500) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function planPrompt(goal: string) {
  const system = [
    "You create concise execution plans for Handle tasks.",
    "Return only valid JSON with 3 to 7 short step titles.",
    'Use either {"steps":["..."]} or a JSON array of strings.',
    `Prompt version: ${PLANNER_PROMPT_VERSION}`,
  ].join("\n");
  const human = redactSecrets(goal);
  const preview = [
    { content: system, role: "system" },
    { content: human, role: "human" },
  ];

  return {
    messages: [new SystemMessage(system), new HumanMessage(human)],
    preview,
  };
}

export async function emitInitialPlan(
  taskId: string,
  goal: string,
  options: EmitInitialPlanOptions = {},
) {
  const provider = options.provider ?? {
    id: "openai",
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
  };
  const llm =
    options.llm ?? createOpenAIChatModel({ streaming: false, temperature: 0 });
  const prompt = planPrompt(goal);
  const startedAt = Date.now();

  logger.info(
    {
      model: provider.model,
      promptPreview: truncateForLog(JSON.stringify(prompt.preview)),
      promptVersion: PLANNER_PROMPT_VERSION,
      providerId: provider.id,
      taskId,
    },
    "Plan generation started",
  );

  try {
    logger.info(
      {
        model: provider.model,
        providerId: provider.id,
        taskId,
      },
      "Plan generation LangChain invoke started",
    );

    const response = await llm.invoke(prompt.messages, {
      ...(options.signal ? { signal: options.signal } : {}),
    });

    logger.info(
      {
        durationMs: Date.now() - startedAt,
        model: provider.model,
        providerId: provider.id,
        taskId,
      },
      "Plan generation LangChain invoke completed",
    );

    const responseText = contentToString(response.content);
    const parsedPlan = parsePlanStepsDetailed(responseText);
    const steps = parsedPlan.steps;
    if (parsedPlan.usedFallback) {
      logger.warn(
        {
          durationMs: Date.now() - startedAt,
          err: parsedPlan.parseError,
          model: provider.model,
          providerId: provider.id,
          responsePreview: truncateForLog(redactSecrets(responseText)),
          taskId,
        },
        "Plan generation response was not JSON; using fallback plan",
      );
    }

    emitTaskEvent({ type: "plan_update", steps, taskId });
    logger.info(
      {
        durationMs: Date.now() - startedAt,
        model: provider.model,
        providerId: provider.id,
        stepCount: steps.length,
        taskId,
      },
      "Plan generation complete",
    );

    return steps;
  } catch (err) {
    logger.error(
      {
        durationMs: Date.now() - startedAt,
        err,
        model: provider.model,
        providerId: provider.id,
        taskId,
      },
      "Plan generation failed",
    );
    throw err;
  }
}
