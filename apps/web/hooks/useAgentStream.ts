'use client';

import { useEffect, useReducer } from 'react';
import type {
  ApprovalPayload,
  BrowserScreenshotEvent,
  CriticReviewEvent,
  MemoryRecallEvent,
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
  criticReviews: CriticReviewEvent[];
  error: string | null;
  finalMessage: string | null;
  memoryFacts: MemoryRecallEvent['facts'];
  pendingApproval: (ApprovalPayload & { approvalId: string }) | null;
  planSteps: PlanStep[];
  status: TaskStatus | 'IDLE';
  thought: string;
  toolCalls: ToolCallState[];
}

type Action = { type: 'event'; event: SSEEvent } | { type: 'reset' };

const initialState: AgentStreamState = {
  browserScreenshots: [],
  criticReviews: [],
  error: null,
  finalMessage: null,
  memoryFacts: [],
  pendingApproval: null,
  planSteps: [],
  status: 'IDLE',
  thought: '',
  toolCalls: [],
};
const EMPTY_EVENTS: SSEEvent[] = [];

function startPlan(steps: PlanStep[]): PlanStep[] {
  if (steps.some((step) => step.state === 'active' || step.state === 'done')) {
    return steps;
  }

  return steps.map((step, index) => ({
    ...step,
    state: index === 0 ? 'active' : 'pending',
  }));
}

function progressPlan(steps: PlanStep[], completedSteps: number, done = false): PlanStep[] {
  if (steps.length === 0) return steps;
  if (done) return steps.map((step) => ({ ...step, state: 'done' as const }));

  const boundedCompleted = Math.max(0, Math.min(completedSteps, steps.length));
  return steps.map((step, index) => ({
    ...step,
    state:
      index < boundedCompleted
        ? 'done'
        : index === boundedCompleted
          ? 'active'
          : 'pending',
  }));
}

function upsertToolCall(toolCalls: ToolCallState[], event: Extract<SSEEvent, { type: 'tool_call' }>) {
  if (!toolCalls.some((toolCall) => toolCall.callId === event.callId)) {
    return [
      ...toolCalls,
      {
        args: event.args,
        callId: event.callId,
        status: 'running' as const,
        streams: [],
        toolName: event.toolName,
      },
    ];
  }

  return toolCalls.map((toolCall) =>
    toolCall.callId === event.callId
      ? { ...toolCall, args: event.args, toolName: event.toolName }
      : toolCall,
  );
}

function isTerminalStatus(status: TaskStatus | 'IDLE') {
  return status === 'STOPPED' || status === 'ERROR' || status === 'CANCELLED';
}

function statusFromEvents(events: SSEEvent[] | undefined) {
  return events
    ?.filter((event): event is Extract<SSEEvent, { type: 'status_update' }> => event.type === 'status_update')
    .at(-1)?.status;
}

export function agentStreamReducer(state: AgentStreamState, action: Action): AgentStreamState {
  if (action.type === 'reset') return initialState;

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
    case 'critic_review':
      return state.criticReviews.some((review) => review.id === event.id)
        ? state
        : { ...state, criticReviews: [...state.criticReviews, event] };
    case 'error':
      return { ...state, error: event.message, status: 'ERROR' };
    case 'message':
      return {
        ...state,
        finalMessage: event.content,
        planSteps: progressPlan(state.planSteps, state.planSteps.length, true),
        thought: '',
      };
    case 'memory_status':
      return state;
    case 'memory_recall':
      return { ...state, memoryFacts: event.facts };
    case 'plan_update':
      return { ...state, planSteps: startPlan(event.steps) };
    case 'provider_fallback':
      return state;
    case 'status_update':
      return {
        ...state,
        pendingApproval: event.status === 'WAITING' ? state.pendingApproval : null,
        planSteps:
          event.status === 'STOPPED'
            ? progressPlan(state.planSteps, state.planSteps.length, true)
            : state.planSteps,
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
        toolCalls: upsertToolCall(state.toolCalls, event),
      };
    case 'tool_result': {
      const toolCalls = state.toolCalls.map((toolCall) =>
        toolCall.callId === event.callId
          ? {
              ...toolCall,
              ...(event.error ? { error: event.error } : {}),
              ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
              result: event.result,
              status: event.error ? ('error' as const) : ('done' as const),
            }
          : toolCall,
      );
      const completedTools = toolCalls.filter((toolCall) => toolCall.status === 'done').length;
      return {
        ...state,
        planSteps: progressPlan(state.planSteps, completedTools),
        toolCalls,
      };
    }
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

export function useAgentStream(taskId: string | null, initialEvents: SSEEvent[] = EMPTY_EVENTS) {
  const [state, dispatch] = useReducer(agentStreamReducer, initialState);
  const initialStatus = statusFromEvents(initialEvents);

  useEffect(() => {
    dispatch({ type: 'reset' });
    initialEvents.forEach((event) => {
      dispatch({ type: 'event', event });
    });
  }, [initialEvents, taskId]);

  useEffect(() => {
    if (!taskId) {
      dispatch({ type: 'reset' });
      return;
    }

    if (isTerminalStatus(initialStatus ?? 'IDLE')) return;

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
  }, [initialStatus, taskId]);

  return state;
}
