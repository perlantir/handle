import { describe, expect, it } from 'vitest';
import { emitTaskEvent, subscribeToTask } from './eventBus';

describe('eventBus', () => {
  it('routes events to listeners for the matching task', () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToTask('task-a', (event) => received.push(event));

    emitTaskEvent({ type: 'status_update', taskId: 'task-a', status: 'RUNNING' });
    emitTaskEvent({ type: 'status_update', taskId: 'task-b', status: 'ERROR' });

    unsubscribe();
    emitTaskEvent({ type: 'status_update', taskId: 'task-a', status: 'STOPPED' });

    expect(received).toEqual([{ type: 'status_update', taskId: 'task-a', status: 'RUNNING' }]);
  });
});
