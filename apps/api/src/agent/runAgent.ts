import { createE2BSandbox } from '../execution/e2bBackend';
import type { E2BSandboxLike } from '../execution/types';
import { emitTaskEvent } from '../lib/eventBus';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redactSecrets } from '../lib/redact';
import { createPhase1Agent } from './createAgent';
import { parseAgentFinalResult } from './finalResult';
import { emitInitialPlan } from './plan';

function eventContentToString(content: unknown) {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part && 'text' in part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }

  return '';
}

function getFinalOutput(output: unknown) {
  if (typeof output === 'string') return output;
  if (typeof output === 'object' && output && 'output' in output && typeof output.output === 'string') {
    return output.output;
  }

  return null;
}

export async function runAgent(taskId: string, goal: string) {
  let sandbox: E2BSandboxLike | null = null;

  try {
    emitTaskEvent({ type: 'status_update', status: 'RUNNING', taskId });

    sandbox = await createE2BSandbox();
    await prisma.task.update({
      data: { sandboxId: sandbox.sandboxId },
      where: { id: taskId },
    });

    await emitInitialPlan(taskId, goal);

    const agent = await createPhase1Agent({ taskId, sandbox });
    const stream = await agent.streamEvents({ chat_history: [], input: redactSecrets(goal) }, { version: 'v2' });
    let finalAnswer = '';

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk;
        const content = eventContentToString(chunk?.content);

        if (content) {
          const redacted = redactSecrets(content);
          emitTaskEvent({ type: 'thought', content: redacted, taskId });
          finalAnswer += redacted;
        }
      }

      if (event.event === 'on_chain_end' && event.name === 'AgentExecutor') {
        const output = getFinalOutput(event.data?.output);
        if (output) finalAnswer = redactSecrets(output);
      }
    }

    const finalResult = parseAgentFinalResult(finalAnswer);
    const finalStatus = finalResult.success ? 'STOPPED' : 'ERROR';
    const finalMessage = finalResult.message || (finalResult.success ? 'Task completed.' : 'Task failed.');

    await prisma.message.create({
      data: { content: finalMessage, role: 'ASSISTANT', taskId },
    });
    await prisma.task.update({
      data: { status: finalStatus },
      where: { id: taskId },
    });

    emitTaskEvent({ type: 'message', role: 'assistant', content: finalMessage, taskId });
    if (!finalResult.success) {
      emitTaskEvent({
        type: 'error',
        message: finalResult.reason ?? 'Agent reported task failure',
        taskId,
      });
    }
    emitTaskEvent({
      type: 'status_update',
      status: finalStatus,
      ...(finalResult.reason ? { detail: finalResult.reason } : {}),
      taskId,
    });
  } catch (err) {
    logger.error({ err, taskId }, 'Agent run failed');

    const message = redactSecrets(err instanceof Error ? err.message : String(err));

    await prisma.task.update({ data: { status: 'ERROR' }, where: { id: taskId } }).catch((updateErr) => {
      logger.warn({ err: updateErr, taskId }, 'Failed to mark task as errored');
    });

    emitTaskEvent({ type: 'error', message, taskId });
    emitTaskEvent({ type: 'status_update', status: 'ERROR', taskId });
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((err) => {
        logger.warn({ err, taskId }, 'Failed to kill E2B sandbox');
      });
    }
  }
}
