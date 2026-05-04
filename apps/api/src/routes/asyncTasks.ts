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
}): AsyncTaskSummary {
  return {
    asyncMode: Boolean(run.asyncMode),
    completedAt: run.completedAt?.toISOString() ?? null,
    conversationId: run.conversationId,
    goal: run.goal,
    id: run.id,
    lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
    lastNotifiedAt: run.lastNotifiedAt?.toISOString() ?? null,
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

    return res.json({ tasks: runs.map(serializeRun) });
  }),
);
