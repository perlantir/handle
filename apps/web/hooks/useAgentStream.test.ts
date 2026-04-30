import { describe, expect, it } from 'vitest';
import { agentStreamReducer, type AgentStreamState } from './useAgentStream';

const initialState: AgentStreamState = {
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
});
