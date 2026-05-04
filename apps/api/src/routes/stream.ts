import { Router } from "express";
import type { Response } from "express";
import type {
  AssistantMessageEvent,
  SSEEvent,
  StatusUpdateEvent,
  TaskStatus,
} from "@handle/shared";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { replayEventsForRun } from "../lib/runObservability";
import { subscribeToTask } from "../lib/eventBus";

interface StreamRouteStore {
  agentRun: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
}

interface CreateStreamRouterOptions {
  getUserId?: typeof getAuthenticatedUserId;
  pollIntervalMs?: number;
  store?: StreamRouteStore;
}

interface PersistedAssistantMessage {
  content: string;
  id: string;
  role: string;
}

interface PersistedTaskSnapshot {
  messages: PersistedAssistantMessage[];
  observabilityEvents: SSEEvent[];
  status: TaskStatus;
}

const TERMINAL_STREAM_STATUSES = new Set<TaskStatus>([
  "CANCELLED",
  "ERROR",
  "STOPPED",
]);

function taskStatusFromRun(status: unknown): TaskStatus {
  if (status === "QUEUED") return "QUEUED";
  if (status === "COMPLETED" || status === "STOPPED") return "STOPPED";
  if (status === "FAILED" || status === "ERROR") return "ERROR";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "PAUSED") return "PAUSED";
  if (status === "WAITING") return "WAITING";
  return "RUNNING";
}

function writeSse(res: Response, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function normalizeMessages(value: unknown): PersistedAssistantMessage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((message) => {
    if (
      typeof message === "object" &&
      message &&
      "content" in message &&
      "id" in message &&
      "role" in message &&
      typeof message.content === "string" &&
      typeof message.id === "string" &&
      typeof message.role === "string"
    ) {
      return [
        {
          content: message.content,
          id: message.id,
          role: message.role,
        },
      ];
    }

    return [];
  });
}

function normalizeSnapshot(run: unknown): PersistedTaskSnapshot | null {
  if (!run || typeof run !== "object") return null;

  const taskId = "id" in run && typeof run.id === "string" ? run.id : "";
  const status = taskStatusFromRun("status" in run ? run.status : undefined);
  const observabilityEvents = replayEventsForRun({
    criticReviews: "criticReviews" in run ? run.criticReviews : undefined,
    taskId,
    toolCalls: "toolCalls" in run ? run.toolCalls : undefined,
  });
  const conversation =
    "conversation" in run &&
    typeof run.conversation === "object" &&
    run.conversation
      ? run.conversation
      : null;
  const messages =
    conversation && "messages" in conversation
      ? normalizeMessages(conversation.messages).filter(
          (message) => message.role === "ASSISTANT",
        )
      : [];

  return { messages, observabilityEvents, status };
}

async function loadPersistedSnapshot(store: StreamRouteStore, taskId: string) {
  const run = await store.agentRun.findFirst({
    include: {
      conversation: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            where: { role: "ASSISTANT" },
          },
        },
      },
      criticReviews: { orderBy: { createdAt: "asc" } },
    },
    where: { id: taskId },
  });

  return normalizeSnapshot(run);
}

export function createStreamRouter({
  getUserId = getAuthenticatedUserId,
  pollIntervalMs = 1000,
  store = prisma,
}: CreateStreamRouterOptions = {}) {
  const router = Router();

  router.get(
    "/:taskId/stream",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).end();

      const taskIdParam = req.params.taskId;
      if (!taskIdParam) return res.status(400).end();
      const taskId = taskIdParam;

      const task = await store.agentRun.findFirst({
        where: { id: taskId },
      });
      if (!task) return res.status(404).end();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      let closed = false;
      let lastStatus: TaskStatus | null = null;
      const emittedMessageIds = new Set<string>();
      const emittedObservabilityKeys = new Set<string>();
      const liveToolStreamChannels = new Set<string>();

      function observabilityKey(event: SSEEvent) {
        if (event.type === "critic_review") return `critic_review:${event.id}`;
        if (event.type === "tool_call") return `tool_call:${event.callId}`;
        if (event.type === "tool_result") return `tool_result:${event.callId}`;
        if (event.type === "tool_stream") {
          return `tool_stream:${event.callId}:${event.channel}:${event.content}`;
        }
        return `${event.type}:${JSON.stringify(event)}`;
      }

      function emitObservabilityEvent(event: SSEEvent) {
        if (event.type === "tool_stream") {
          const channelKey = `${event.callId}:${event.channel}`;
          if (liveToolStreamChannels.has(channelKey)) return;
        }

        const key = observabilityKey(event);
        if (emittedObservabilityKeys.has(key)) return;
        emittedObservabilityKeys.add(key);
        writeSse(res, event);
      }

      function emitPersistedSnapshot(snapshot: PersistedTaskSnapshot) {
        snapshot.observabilityEvents.forEach((event) => {
          emitObservabilityEvent(event);
        });

        snapshot.messages.forEach((message) => {
          if (emittedMessageIds.has(message.id)) return;
          emittedMessageIds.add(message.id);
          const event: AssistantMessageEvent = {
            content: message.content,
            role: "assistant",
            taskId,
            type: "message",
          };
          writeSse(res, event);
        });

        if (snapshot.status !== lastStatus) {
          lastStatus = snapshot.status;
          const event: StatusUpdateEvent = {
            status: snapshot.status,
            taskId,
            type: "status_update",
          };
          writeSse(res, event);
          logger.info(
            { status: snapshot.status, taskId, userId },
            "SSE emitted persisted task status",
          );
        }

        if (TERMINAL_STREAM_STATUSES.has(snapshot.status)) {
          closed = true;
          clearInterval(heartbeat);
          clearInterval(pollPersistedState);
          unsubscribe();
          setTimeout(() => {
            if (!res.writableEnded) res.end();
          }, 250);
        }
      }

      async function reconcilePersistedState() {
        if (closed) return;
        try {
          const snapshot = await loadPersistedSnapshot(store, taskId);
          if (snapshot) emitPersistedSnapshot(snapshot);
        } catch (err) {
          logger.warn(
            { err, taskId, userId },
            "SSE persisted task reconciliation failed",
          );
        }
      }

      const heartbeat = setInterval(() => {
        res.write(":\n\n");
      }, 15_000);
      const unsubscribe = subscribeToTask(taskId, (event) => {
        if (event.type === "tool_stream") {
          liveToolStreamChannels.add(`${event.callId}:${event.channel}`);
        }
        emittedObservabilityKeys.add(observabilityKey(event));
        writeSse(res, event);
      });
      const pollPersistedState = setInterval(() => {
        void reconcilePersistedState();
      }, pollIntervalMs);

      void reconcilePersistedState();

      req.on("close", () => {
        closed = true;
        logger.info({ taskId, userId }, "SSE client disconnected");
        clearInterval(heartbeat);
        clearInterval(pollPersistedState);
        unsubscribe();
      });
    }),
  );

  return router;
}

export const streamRouter = createStreamRouter();
