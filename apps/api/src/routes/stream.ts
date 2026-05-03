import { Router } from 'express';
import { getAuthenticatedUserId } from '../auth/clerkMiddleware';
import { asyncHandler } from '../lib/http';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { subscribeToTask } from '../lib/eventBus';

export const streamRouter = Router();

streamRouter.get(
  '/:taskId/stream',
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).end();

    const { taskId } = req.params;
    if (!taskId) return res.status(400).end();

    const task = await prisma.agentRun.findFirst({
      where: { id: taskId },
    });
    if (!task) return res.status(404).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      res.write(':\n\n');
    }, 15_000);
    const unsubscribe = subscribeToTask(task.id, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      logger.info({ taskId: task.id, userId }, 'SSE client disconnected');
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);
