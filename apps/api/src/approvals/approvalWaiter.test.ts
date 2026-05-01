import { afterEach, describe, expect, it, vi } from 'vitest';
import { awaitApproval, type ApprovalStore } from './approvalWaiter';

describe('awaitApproval', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out pending approvals and returns timeout', async () => {
    vi.useFakeTimers();

    const events: unknown[] = [];
    const store: ApprovalStore = {
      approvalRequest: {
        async create() {
          return { id: 'approval-test', status: 'pending', taskId: 'task-test' };
        },
        async updateMany() {
          return { count: 1 };
        },
      },
      task: {
        async update() {
          return {};
        },
      },
    };

    const decision = awaitApproval(
      'task-test',
      { reason: 'Needs user approval', type: 'shell_exec' },
      {
        emitEvent: (event) => events.push(event),
        store,
        timeoutMs: 100,
      },
    );

    await vi.advanceTimersByTimeAsync(100);

    await expect(decision).resolves.toBe('timeout');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'approval_request', approvalId: 'approval-test' }),
        expect.objectContaining({ type: 'status_update', status: 'WAITING' }),
        expect.objectContaining({ type: 'status_update', status: 'RUNNING', detail: 'Approval timed out' }),
      ]),
    );
  });
});
