'use client';

import { useEffect, useReducer } from 'react';
import type { ApprovalPayload, PlanStep, SSEEvent, TaskStatus } from '@handle/shared';

export interface ToolCallState {
  args: Record<string, unknown>;
  callId: string;
  error?: string;
  exitCode?: number;
  result?: string;
  status: 'running' | 'done' | 'error';
  streams: Array<{ channel: 'stdout' | 'stderr'; content: string }>;
  toolName: string;
}

export interface AgentStreamState {
  error: string | null;
  finalMessage: string | null;
  pendingApproval: (ApprovalPayload & { approvalId: string }) | null;
  planSteps: PlanStep[];
  status: TaskStatus | 'IDLE';
  thought: string;
  toolCalls: ToolCallState[];
}

type Action = { type: 'event'; event: SSEEvent } | { type: 'reset' };

const initialState: AgentStreamState = {
  error: null,
  finalMessage: null,
  pendingApproval: null,
  planSteps: [],
  status: 'IDLE',
  thought: '',
  toolCalls: [],
};

export function agentStreamReducer(state: AgentStreamState, action: Action): AgentStreamState {
  if (action.type === 'reset') return initialState;

  const { event } = action;

  switch (event.type) {
    case 'approval_request':
      return { ...state, pendingApproval: { ...event.request, approvalId: event.approvalId } };
    case 'browser_screenshot':
      return state;
    case 'error':
      return { ...state, error: event.message, status: 'ERROR' };
    case 'message':
      return { ...state, finalMessage: event.content };
    case 'plan_update':
      return { ...state, planSteps: event.steps };
    case 'provider_fallback':
      return state;
    case 'status_update':
      return {
        ...state,
        pendingApproval: event.status === 'WAITING' ? state.pendingApproval : null,
        status: event.status,
      };
    case 'thought':
      return { ...state, thought: state.thought + event.content };
    case 'tool_call':
      return {
        ...state,
        thought: '',
        toolCalls: [
          ...state.toolCalls,
          {
            args: event.args,
            callId: event.callId,
            status: 'running',
            streams: [],
            toolName: event.toolName,
          },
        ],
      };
    case 'tool_result':
      return {
        ...state,
        toolCalls: state.toolCalls.map((toolCall) =>
          toolCall.callId === event.callId
            ? {
                ...toolCall,
                ...(event.error ? { error: event.error } : {}),
                ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
                result: event.result,
                status: event.error ? 'error' : 'done',
              }
            : toolCall,
        ),
      };
    case 'tool_stream':
      return {
        ...state,
        toolCalls: state.toolCalls.map((toolCall) =>
          toolCall.callId === event.callId
            ? {
                ...toolCall,
                streams: [...toolCall.streams, { channel: event.channel, content: event.content }],
              }
            : toolCall,
        ),
      };
  }
}

export function useAgentStream(taskId: string | null) {
  const [state, dispatch] = useReducer(agentStreamReducer, initialState);

  useEffect(() => {
    if (!taskId) {
      dispatch({ type: 'reset' });
      return;
    }

    const eventSource = new EventSource(`/api/stream/${taskId}`);

    eventSource.onmessage = (event) => {
      try {
        dispatch({ type: 'event', event: JSON.parse(event.data) as SSEEvent });
      } catch {
        dispatch({ type: 'event', event: { type: 'error', message: 'Malformed stream event', taskId } });
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  return state;
}
