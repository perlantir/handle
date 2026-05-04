import type { ExecutionBackend } from "../execution/types";
import { logger } from "../lib/logger";

const DEFAULT_CANCEL_REASON = "Cancelled by user";
const DEFAULT_PAUSE_REASON = "Paused by user";
const PAUSE_REASON_PREFIX = "__HANDLE_PAUSE__:";

interface ActiveAgentRun {
  backend: ExecutionBackend | null;
  controller: AbortController;
  shutdownPromise: Promise<void> | null;
}

export class AgentRunCancelledError extends Error {
  constructor(reason = DEFAULT_CANCEL_REASON) {
    super(reason);
    this.name = "AgentRunCancelledError";
  }
}

const activeRuns = new Map<string, ActiveAgentRun>();

export function beginAgentRun(taskId: string) {
  const controller = new AbortController();
  const activeRun: ActiveAgentRun = {
    backend: null,
    controller,
    shutdownPromise: null,
  };

  activeRuns.set(taskId, activeRun);

  function throwIfCancelled() {
    if (controller.signal.aborted) {
      throw new AgentRunCancelledError(cancelReason(controller.signal));
    }
  }

  return {
    signal: controller.signal,
    setBackend(backend: ExecutionBackend) {
      activeRun.backend = backend;
      if (controller.signal.aborted) {
        activeRun.shutdownPromise = shutdownBackend(taskId, activeRun);
      }
    },
    throwIfCancelled,
    unregister() {
      if (activeRuns.get(taskId) === activeRun) {
        activeRuns.delete(taskId);
      }
    },
  };
}

export function isAgentRunCancelledError(
  error: unknown,
): error is AgentRunCancelledError {
  return error instanceof AgentRunCancelledError;
}

export function cancelReason(signal: AbortSignal) {
  return typeof signal.reason === "string" && signal.reason.trim()
    ? signal.reason.replace(PAUSE_REASON_PREFIX, "")
    : DEFAULT_CANCEL_REASON;
}

export function isAgentRunPausedSignal(signal: AbortSignal) {
  return typeof signal.reason === "string" && signal.reason.startsWith(PAUSE_REASON_PREFIX);
}

export function pauseReason(signal: AbortSignal) {
  return typeof signal.reason === "string" && signal.reason.startsWith(PAUSE_REASON_PREFIX)
    ? signal.reason.slice(PAUSE_REASON_PREFIX.length)
    : DEFAULT_PAUSE_REASON;
}

export async function cancelActiveAgentRun(
  taskId: string,
  reason = DEFAULT_CANCEL_REASON,
) {
  const activeRun = activeRuns.get(taskId);
  if (!activeRun) return { active: false };

  if (!activeRun.controller.signal.aborted) {
    activeRun.controller.abort(reason);
  }

  await shutdownBackend(taskId, activeRun);
  return { active: true };
}

export async function pauseActiveAgentRun(
  taskId: string,
  reason = DEFAULT_PAUSE_REASON,
) {
  const activeRun = activeRuns.get(taskId);
  if (!activeRun) return { active: false };

  if (!activeRun.controller.signal.aborted) {
    activeRun.controller.abort(`${PAUSE_REASON_PREFIX}${reason}`);
  }

  await shutdownBackend(taskId, activeRun);
  return { active: true };
}

async function shutdownBackend(taskId: string, activeRun: ActiveAgentRun) {
  if (!activeRun.backend) return;
  if (!activeRun.shutdownPromise) {
    activeRun.shutdownPromise = activeRun.backend.shutdown(taskId).catch((err) => {
      logger.warn({ err, taskId }, "Failed to shut down backend during cancel");
    });
  }

  await activeRun.shutdownPromise;
}
