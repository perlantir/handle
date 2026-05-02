import { Router } from 'express';
import { z } from 'zod';
import type { ApprovalPayload } from '@handle/shared';
import { getAuthenticatedUserId } from '../auth/clerkMiddleware';
import { resolveApprovalWaiter } from '../approvals/approvalWaiter';
import { emitTaskEvent } from '../lib/eventBus';
import { asyncHandler } from '../lib/http';
import { prisma } from '../lib/prisma';

const respondSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
});

export interface ApprovalRow {
  id: string;
  payload: unknown;
  status: string;
  taskId: string;
  type: string;
}

export interface ApprovalRouteStore {
  approvalRequest: {
    findFirst(args: unknown): Promise<ApprovalRow | null>;
    findMany(args: unknown): Promise<ApprovalRow[]>;
    update(args: unknown): Promise<{ id: string; status: string; taskId: string }>;
  };
  agentRun?: {
    findFirst(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    update(args: unknown): Promise<unknown>;
  };
  task?: {
    findFirst(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    update(args: unknown): Promise<unknown>;
  };
}

interface CreateApprovalsRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  store?: ApprovalRouteStore;
}

function serializeApproval(row: ApprovalRow) {
  return {
    approvalId: row.id,
    request: row.payload as ApprovalPayload,
    status: row.status,
    taskId: row.taskId,
    type: row.type,
  };
}

export function createApprovalsRouter({ getUserId = getAuthenticatedUserId, store = prisma }: CreateApprovalsRouterOptions = {}) {
  const router = Router();

  router.get(
    '/pending',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const runStore = store.agentRun ?? store.task;
      if (!runStore) return res.json({ approvals: [] });

      const tasks = await runStore.findMany({
        select: { id: true },
        where: store.agentRun ? {} : { userId },
      });
      const taskIds = tasks.map((task) => task.id);

      if (taskIds.length === 0) return res.json({ approvals: [] });

      const approvals = await store.approvalRequest.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
          status: { in: ['pending', 'timeout'] },
          taskId: { in: taskIds },
        },
      });

      return res.json({ approvals: approvals.map(serializeApproval) });
    }),
  );

  router.post(
    '/respond',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const parsed = respondSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      }

      const approval = await store.approvalRequest.findFirst({
        where: { id: parsed.data.approvalId },
      });
      if (!approval) return res.status(404).json({ error: 'Approval not found' });

      const runStore = store.agentRun ?? store.task;
      if (!runStore) return res.status(404).json({ error: 'Approval not found' });

      const task = await runStore.findFirst({
        where: store.agentRun ? { id: approval.taskId } : { id: approval.taskId, userId },
      });
      if (!task) return res.status(404).json({ error: 'Approval not found' });

      if (approval.status !== 'pending') {
        return res.json({ approvalId: approval.id, status: approval.status });
      }

      const updated = await store.approvalRequest.update({
        data: { respondedAt: new Date(), status: parsed.data.decision },
        where: { id: approval.id },
      });
      await runStore.update({
        data: { status: 'RUNNING' },
        where: { id: approval.taskId },
      });

      resolveApprovalWaiter(approval.id, parsed.data.decision);
      emitTaskEvent({
        type: 'status_update',
        detail: `Approval ${parsed.data.decision}`,
        status: 'RUNNING',
        taskId: approval.taskId,
      });

      return res.json({ approvalId: updated.id, status: updated.status });
    }),
  );

  return router;
}

export const approvalsRouter = createApprovalsRouter();
