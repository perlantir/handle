import type { ApprovalPayload, SSEEvent, TaskStatus } from '@handle/shared';
import type { Prisma } from '@prisma/client';
import { emitTaskEvent } from '../lib/eventBus';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { notifyTaskEvent } from '../notifications/notificationService';

export type ApprovalDecision = 'approved' | 'denied' | 'timeout';

export interface ApprovalStore {
  approvalRequest: {
    create(args: unknown): Promise<{ id: string; status: string; taskId: string }>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  agentRun?: {
    update(args: unknown): Promise<unknown>;
  };
  task?: {
    update(args: unknown): Promise<unknown>;
  };
}

export interface AwaitApprovalOptions {
  emitEvent?: (event: SSEEvent) => void;
  store?: ApprovalStore;
  timeoutMs?: number;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

// Phase 1 uses in-memory waiters because the API runs as a single local process.
// Pending waits do not survive backend restarts; startup cleanup marks stale rows timed out.
const approvalWaiters = new Map<
  string,
  {
    resolve: (decision: ApprovalDecision) => void;
    timeout: NodeJS.Timeout;
  }
>();

async function updateTaskStatus(store: ApprovalStore, taskId: string, status: TaskStatus) {
  const data =
    store.agentRun && status === 'STOPPED'
      ? { status: 'COMPLETED' }
      : store.agentRun && status === 'ERROR'
        ? { status: 'FAILED' }
        : { status };

  if (store.agentRun) {
    await store.agentRun.update({
      data,
      where: { id: taskId },
    });
    return;
  }

  if (!store.task) return;
  await store.task.update({
    data: { status },
    where: { id: taskId },
  });
}

export function resolveApprovalWaiter(approvalId: string, decision: Exclude<ApprovalDecision, 'timeout'>) {
  const waiter = approvalWaiters.get(approvalId);

  if (!waiter) return false;

  clearTimeout(waiter.timeout);
  approvalWaiters.delete(approvalId);
  waiter.resolve(decision);

  return true;
}

export async function awaitApproval(taskId: string, request: ApprovalPayload, options: AwaitApprovalOptions = {}) {
  const store = options.store ?? prisma;
  const emitEvent = options.emitEvent ?? emitTaskEvent;
  const timeoutMs = options.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const approval = await store.approvalRequest.create({
    data: {
      payload: request as unknown as Prisma.InputJsonValue,
      status: 'pending',
      taskId,
      type: request.type,
    },
  });

  await updateTaskStatus(store, taskId, 'WAITING');
  emitEvent({ type: 'status_update', status: 'WAITING', detail: request.reason, taskId });
  emitEvent({ type: 'approval_request', approvalId: approval.id, request, taskId });
  if (store === prisma) {
    void notifyTaskEvent({
      agentRunId: taskId,
      detail: request.reason,
      eventType: 'APPROVAL_NEEDED',
    }).catch((err) => {
      logger.warn({ approvalId: approval.id, err, taskId }, 'Approval notification failed');
    });
  }

  return new Promise<ApprovalDecision>((resolve) => {
    const timeout = setTimeout(() => {
      approvalWaiters.delete(approval.id);

      void store.approvalRequest
        .updateMany({
          data: { respondedAt: new Date(), status: 'timeout' },
          where: { id: approval.id, status: 'pending' },
        })
        .then(() => updateTaskStatus(store, taskId, 'RUNNING'))
        .then(() => {
          emitEvent({ type: 'status_update', status: 'RUNNING', detail: 'Approval timed out', taskId });
          resolve('timeout');
        })
        .catch((err) => {
          logger.error({ approvalId: approval.id, err, taskId }, 'Failed to time out approval');
          resolve('timeout');
        });
    }, timeoutMs);

    approvalWaiters.set(approval.id, { resolve, timeout });
  });
}
