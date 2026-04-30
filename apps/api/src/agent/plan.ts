import { z } from 'zod';
import type { PlanStep } from '@handle/shared';
import { emitTaskEvent } from '../lib/eventBus';
import { logger } from '../lib/logger';
import { redactSecrets } from '../lib/redact';
import { createOpenAIChatModel } from './createAgent';

export const PLANNER_PROMPT_VERSION = 'plan_prompt_v1';

const planResponseSchema = z.union([
  z.array(z.string()),
  z.object({
    steps: z.array(z.string()),
  }),
]);

function contentToString(content: unknown) {
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);

  if (fenced?.[1]) return fenced[1].trim();

  const arrayStart = trimmed.indexOf('[');
  const objectStart = trimmed.indexOf('{');
  const starts = [arrayStart, objectStart].filter((index) => index >= 0);

  if (starts.length === 0) return trimmed;

  const start = Math.min(...starts);
  const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));

  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function parsePlanSteps(responseText: string): PlanStep[] {
  const parsed = planResponseSchema.parse(JSON.parse(extractJson(responseText)));
  const steps = Array.isArray(parsed) ? parsed : parsed.steps;

  return steps.slice(0, 7).map((title, index) => ({
    id: `plan-${index + 1}`,
    title,
    state: 'pending',
  }));
}

export async function emitInitialPlan(taskId: string, goal: string) {
  const llm = createOpenAIChatModel({ streaming: false, temperature: 0 });

  logger.info({ promptVersion: PLANNER_PROMPT_VERSION, taskId }, 'Generating initial task plan');

  try {
    const response = await llm.invoke([
      [
        'system',
        [
          'You create concise execution plans for Handle tasks.',
          'Return only valid JSON with 3 to 7 short step titles.',
          'Use either {"steps":["..."]} or a JSON array of strings.',
          `Prompt version: ${PLANNER_PROMPT_VERSION}`,
        ].join('\n'),
      ],
      ['human', redactSecrets(goal)],
    ]);
    const steps = parsePlanSteps(contentToString(response.content));

    emitTaskEvent({ type: 'plan_update', steps, taskId });
  } catch (err) {
    logger.warn({ err, taskId }, 'Initial plan generation failed');
  }
}
