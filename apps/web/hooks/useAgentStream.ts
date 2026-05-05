'use client';

import { useEffect, useReducer } from 'react';
import type {
  ApprovalPayload,
  BrowserScreenshotEvent,
  MemoryRecallEvent,
  MultiAgentTraceEvent,
  PlanStep,
  SSEEvent,
  TaskStatus,
} from '@handle/shared';

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
  browserScreenshots: BrowserScreenshotEvent[];
  error: string | null;
  finalMessage: string | null;
  memoryFacts: MemoryRecallEvent['facts'];
  multiAgentTrace: MultiAgentTraceEvent[];
  pendingApproval: (ApprovalPayload & { approvalId: string }) | null;
  planSteps: PlanStep[];
  status: TaskStatus | 'IDLE';
  thought: string;
  toolCalls: ToolCallState[];
}

type Action =
  | { type: 'event'; event: SSEEvent }
  | { type: 'reset' }
  | { type: 'seed_multi_agent_trace'; events: MultiAgentTraceEvent[] };

const initialState: AgentStreamState = {
  browserScreenshots: [],
  error: null,
  finalMessage: null,
  memoryFacts: [],
  multiAgentTrace: [],
  pendingApproval: null,
  planSteps: [],
  status: 'IDLE',
  thought: '',
  toolCalls: [],
};

export function agentStreamReducer(state: AgentStreamState, action: Action): AgentStreamState {
  if (action.type === 'reset') return initialState;
  if (action.type === 'seed_multi_agent_trace') {
    const keyed = new Map<string, MultiAgentTraceEvent>();
    for (const event of [...state.multiAgentTrace, ...action.events]) {
      const key = [
        event.event,
        event.role ?? '',
        event.fromRole ?? '',
        event.toRole ?? '',
        event.subRunId ?? '',
        event.handoffId ?? '',
        event.timestamp,
      ].join(':');
      keyed.set(key, event);
    }
    return { ...state, multiAgentTrace: Array.from(keyed.values()).slice(-60) };
  }

  const { event } = action;

  switch (event.type) {
    case 'approval_request':
      return { ...state, pendingApproval: { ...event.request, approvalId: event.approvalId } };
    case 'agent_run_cancelled':
      return {
        ...state,
        error: null,
        pendingApproval: null,
        status: 'CANCELLED',
        thought: '',
      };
    case 'browser_screenshot':
      return {
        ...state,
        browserScreenshots: [...state.browserScreenshots, event].slice(-10),
      };
    case 'error':
      return { ...state, error: event.message, status: 'ERROR' };
    case 'message':
      return { ...state, finalMessage: event.content, thought: '' };
    case 'memory_status':
      return state;
    case 'memory_recall':
      return { ...state, memoryFacts: event.facts };
    case 'multi_agent_trace':
      return { ...state, multiAgentTrace: [...state.multiAgentTrace, event].slice(-60) };
    case 'plan_update':
      return { ...state, planSteps: event.steps };
    case 'provider_fallback':
      return state;
    case 'status_update':
      return {
        ...state,
        pendingApproval: event.status === 'WAITING' ? state.pendingApproval : null,
        status: event.status,
        thought:
          event.status === 'STOPPED' || event.status === 'ERROR' || event.status === 'CANCELLED' || event.status === 'PAUSED'
            ? ''
            : state.thought,
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

export function useAgentStream(taskId: string | null, initialMultiAgentTrace: MultiAgentTraceEvent[] = []) {
  const [state, dispatch] = useReducer(agentStreamReducer, initialState);

  useEffect(() => {
    if (initialMultiAgentTrace.length > 0) {
      dispatch({ events: initialMultiAgentTrace, type: 'seed_multi_agent_trace' });
    }
  }, [initialMultiAgentTrace]);

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
