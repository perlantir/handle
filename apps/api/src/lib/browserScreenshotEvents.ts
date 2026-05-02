import type { BrowserScreenshotEvent } from "@handle/shared";
import { emitTaskEvent } from "./eventBus";
import { logger } from "./logger";

const SCREENSHOT_THROTTLE_MS = 500;

interface ScreenshotThrottleState {
  droppedCount: number;
  lastEmittedAt: number;
  queued?: BrowserScreenshotEvent;
  timer?: NodeJS.Timeout;
}

const states = new Map<string, ScreenshotThrottleState>();

function stateForTask(taskId: string) {
  let state = states.get(taskId);
  if (!state) {
    state = { droppedCount: 0, lastEmittedAt: 0 };
    states.set(taskId, state);
  }
  return state;
}

function emitNow(event: BrowserScreenshotEvent, state: ScreenshotThrottleState) {
  state.lastEmittedAt = Date.now();
  emitTaskEvent(event);
  logger.info(
    {
      byteCount: event.byteCount,
      callId: event.callId,
      height: event.height,
      source: event.source,
      taskId: event.taskId,
      width: event.width,
    },
    "Browser screenshot event emitted",
  );
}

export function emitBrowserScreenshotEvent({
  callId,
  image,
  source,
  taskId,
  width,
  height,
}: {
  callId?: string;
  image: Buffer;
  source: BrowserScreenshotEvent["source"];
  taskId: string;
  width: number;
  height: number;
}) {
  const state = stateForTask(taskId);
  const event = {
    ...(callId ? { callId } : {}),
    byteCount: image.byteLength,
    height,
    imageBase64: image.toString("base64"),
    source,
    taskId,
    timestamp: new Date().toISOString(),
    type: "browser_screenshot",
    width,
  } satisfies BrowserScreenshotEvent;
  const now = Date.now();
  const elapsed = now - state.lastEmittedAt;

  if (elapsed >= SCREENSHOT_THROTTLE_MS && !state.timer) {
    emitNow(event, state);
    return;
  }

  if (state.queued) state.droppedCount += 1;
  state.queued = event;

  logger.info(
    {
      droppedCount: state.droppedCount,
      queueSize: 1,
      source,
      taskId,
    },
    "Browser screenshot throttle hit",
  );

  if (state.timer) return;

  state.timer = setTimeout(() => {
    const queued = state.queued;
    delete state.queued;
    delete state.timer;
    state.droppedCount = 0;
    if (queued) emitNow(queued, state);
  }, Math.max(SCREENSHOT_THROTTLE_MS - elapsed, 0));
  state.timer.unref?.();
}

export function resetBrowserScreenshotThrottleForTest(taskId?: string) {
  if (taskId) {
    const state = states.get(taskId);
    if (state?.timer) clearTimeout(state.timer);
    states.delete(taskId);
    return;
  }

  for (const state of states.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  states.clear();
}
