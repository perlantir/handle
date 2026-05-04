import { EventEmitter } from 'node:events';
import type { SSEEvent } from '@handle/shared';

export const taskEventBus = new EventEmitter();
taskEventBus.setMaxListeners(100);

type TaskEventRecorder = (event: SSEEvent) => Promise<void> | void;

const taskEventRecorders = new Map<string, Set<TaskEventRecorder>>();

export function registerTaskEventRecorder(taskId: string, recorder: TaskEventRecorder) {
  const recorders = taskEventRecorders.get(taskId) ?? new Set<TaskEventRecorder>();
  recorders.add(recorder);
  taskEventRecorders.set(taskId, recorders);

  return () => {
    const current = taskEventRecorders.get(taskId);
    if (!current) return;
    current.delete(recorder);
    if (current.size === 0) taskEventRecorders.delete(taskId);
  };
}

export function emitTaskEvent(event: SSEEvent) {
  taskEventBus.emit(`task:${event.taskId}`, event);

  taskEventRecorders.get(event.taskId)?.forEach((recorder) => {
    Promise.resolve(recorder(event)).catch(() => undefined);
  });
}

export function subscribeToTask(taskId: string, listener: (event: SSEEvent) => void) {
  taskEventBus.on(`task:${taskId}`, listener);

  return () => {
    taskEventBus.off(`task:${taskId}`, listener);
  };
}
