import { describe, expect, it } from 'vitest';
import { agentStreamReducer, type AgentStreamState } from './useAgentStream';

const initialState: AgentStreamState = {
  browserScreenshots: [],
  error: null,
  finalMessage: null,
  pendingApproval: null,
  planSteps: [],
  status: 'IDLE',
  thought: '',
  toolCalls: [],
};

describe('agentStreamReducer', () => {
  it('applies plan, tool, stream, result, and message events', () => {
    let state = agentStreamReducer(initialState, {
      event: { type: 'plan_update', taskId: 'task-test', steps: [{ id: '1', state: 'pending', title: 'Write file' }] },
      type: 'event',
    });
    state = agentStreamReducer(state, {
      event: { args: { command: 'echo ok' }, callId: 'call-1', taskId: 'task-test', toolName: 'shell.exec', type: 'tool_call' },
      type: 'event',
    });
    state = agentStreamReducer(state, {
      event: { callId: 'call-1', channel: 'stdout', content: 'ok', taskId: 'task-test', type: 'tool_stream' },
      type: 'event',
    });
    state = agentStreamReducer(state, {
      event: { callId: 'call-1', exitCode: 0, result: 'ok', taskId: 'task-test', type: 'tool_result' },
      type: 'event',
    });
    state = agentStreamReducer(state, {
      event: { content: 'Done', role: 'assistant', taskId: 'task-test', type: 'message' },
      type: 'event',
    });

    expect(state.planSteps).toHaveLength(1);
    expect(state.toolCalls[0]).toMatchObject({
      result: 'ok',
      status: 'done',
      streams: [{ channel: 'stdout', content: 'ok' }],
    });
    expect(state.finalMessage).toBe('Done');
  });

  it('clears a pending approval when the task leaves WAITING', () => {
    let state = agentStreamReducer(initialState, {
      event: {
        approvalId: 'approval-test',
        request: { reason: 'Review command', type: 'shell_exec' },
        taskId: 'task-test',
        type: 'approval_request',
      },
      type: 'event',
    });

    expect(state.pendingApproval?.approvalId).toBe('approval-test');

    state = agentStreamReducer(state, {
      event: { status: 'RUNNING', taskId: 'task-test', type: 'status_update' },
      type: 'event',
    });

    expect(state.pendingApproval).toBeNull();
  });

  it('keeps the last 10 browser screenshots', () => {
    let state = initialState;

    for (let index = 0; index < 12; index += 1) {
      state = agentStreamReducer(state, {
        event: {
          byteCount: 8,
          height: 800,
          imageBase64: `image-${index}`,
          source: 'browser_tools',
          taskId: 'task-test',
          timestamp: `2026-05-01T00:00:${String(index).padStart(2, '0')}.000Z`,
          type: 'browser_screenshot',
          width: 1280,
        },
        type: 'event',
      });
    }

    expect(state.browserScreenshots).toHaveLength(10);
    expect(state.browserScreenshots[0]?.imageBase64).toBe('image-2');
    expect(state.browserScreenshots.at(-1)?.imageBase64).toBe('image-11');
  });
});
