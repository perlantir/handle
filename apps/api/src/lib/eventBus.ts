import { EventEmitter } from 'node:events';
import type { SSEEvent } from '@handle/shared';

export const taskEventBus = new EventEmitter();
taskEventBus.setMaxListeners(100);

export function emitTaskEvent(event: SSEEvent) {
  taskEventBus.emit(`task:${event.taskId}`, event);
}

export function subscribeToTask(taskId: string, listener: (event: SSEEvent) => void) {
  taskEventBus.on(`task:${taskId}`, listener);

  return () => {
    taskEventBus.off(`task:${taskId}`, listener);
  };
}
