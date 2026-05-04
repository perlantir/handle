import { Router } from "express";
import type { AsyncTaskSummary } from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";

export const asyncTasksRouter = Router();

function serializeRun(run: {
  asyncMode?: boolean;
  completedAt?: Date | null;
  conversationId: string;
  conversation?: { project?: { id: string; name: string } | null } | null;
  goal: string;
  id: string;
  lastHeartbeatAt?: Date | null;
  lastNotifiedAt?: Date | null;
  queuedAt?: Date | null;
  startedAt?: Date | null;
  status: string;
  workflowId?: string | null;
  workflowRunId?: string | null;
  workflowStatus?: string | null;
}, failedNotifications: Set<string> = new Set()): AsyncTaskSummary {
  return {
    asyncMode: Boolean(run.asyncMode),
    completedAt: run.completedAt?.toISOString() ?? null,
    conversationId: run.conversationId,
    goal: run.goal,
    id: run.id,
    lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
    lastNotifiedAt: run.lastNotifiedAt?.toISOString() ?? null,
    notificationFailed: failedNotifications.has(run.id),
    projectId: run.conversation?.project?.id ?? null,
    projectName: run.conversation?.project?.name ?? null,
    queuedAt: run.queuedAt?.toISOString() ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    status: run.status as AsyncTaskSummary["status"],
    workflowId: run.workflowId ?? null,
    workflowRunId: run.workflowRunId ?? null,
    workflowStatus: run.workflowStatus ?? null,
  };
}

asyncTasksRouter.get(
  "/async/tasks",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const runs = await prisma.agentRun.findMany({
      include: { conversation: { include: { project: true } } },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
      where: {
        OR: [
          { asyncMode: true },
          { status: { in: ["QUEUED", "RUNNING", "WAITING", "PAUSED"] } },
        ],
        userId,
      },
    });
    const failedNotifications = await prisma.notificationDelivery.findMany({
      select: { agentRunId: true },
      where: {
        agentRunId: { in: runs.map((run) => run.id) },
        status: "FAILED",
      },
    });
    const failedRunIds = new Set(
      failedNotifications
        .map((delivery) => delivery.agentRunId)
        .filter((id): id is string => Boolean(id)),
    );

    return res.json({ tasks: runs.map((run) => serializeRun(run, failedRunIds)) });
  }),
);
