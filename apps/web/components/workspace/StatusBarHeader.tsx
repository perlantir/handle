'use client';

import { Pause, Square } from 'lucide-react';
import type { TaskDetailResponse, TaskStatus } from '@handle/shared';
import type { AgentStreamState, ToolCallState } from '@/hooks/useAgentStream';
import { cn } from '@/lib/utils';
import { ApprovalPill, StatusDot } from '@/components/design-system';

interface StatusBarHeaderProps {
  state: AgentStreamState;
  task: TaskDetailResponse | null;
}

function dotStatus(status: AgentStreamState['status'] | TaskStatus) {
  if (status === 'ERROR') return 'error';
  if (status === 'PAUSED') return 'paused';
  if (status === 'STOPPED') return 'success';
  if (status === 'WAITING') return 'waiting';
  return 'running';
}

function statusSubtitle(state: AgentStreamState) {
  let runningTool: ToolCallState | null = null;
  let latestTool: ToolCallState | null = null;
  for (let index = state.toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = state.toolCalls[index];
    if (!toolCall) continue;
    if (!latestTool) latestTool = toolCall;
    if (toolCall.status === 'running') {
      runningTool = toolCall;
      break;
    }
  }

  if (state.error) return state.error;
  if (state.status === 'WAITING') return state.pendingApproval?.reason ?? 'Waiting for approval';
  if (state.status === 'STOPPED') return 'Complete';
  if (latestTool) return `${runningTool ? 'Running' : 'Last ran'} ${latestTool.toolName}`;
  if (state.thought) return 'Thinking';
  if (state.status === 'IDLE') return 'Connecting to task stream';
  return 'Working';
}

function Meta({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex flex-col items-end leading-[1.1]">
      <span className="text-[10px] uppercase tracking-[0.04em] text-text-muted">{label}</span>
      <span className={cn('text-[12px] text-text-secondary tabular-nums', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

export function StatusBarHeader({ state, task }: StatusBarHeaderProps) {
  const status = state.status === 'IDLE' && task ? task.status : state.status;
  const hasPendingApproval = state.status === 'WAITING' || Boolean(state.pendingApproval);

  return (
    <header className="mt-8 flex h-14 shrink-0 items-center gap-[14px] border-b border-border-subtle px-8 pr-6">
      <StatusDot status={dotStatus(status)} pulsing={status !== 'STOPPED' && status !== 'ERROR'} size="lg" />
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-text-primary">
          {task?.goal ?? 'Task in progress'}
        </h1>
        <p className="truncate text-[11px] text-text-tertiary">
          <span className={cn(status === 'ERROR' ? 'text-status-error' : 'text-accent', 'font-medium')}>{statusSubtitle(state)}</span>
        </p>
      </div>

      <span className="flex-1" />

      <div className="hidden items-center gap-4 lg:flex">
        <Meta label="Model" value="OpenAI" />
        <span className="h-[22px] w-px bg-border-subtle" />
        <Meta label="Runtime" mono value="Live" />
        <span className="h-[22px] w-px bg-border-subtle" />
        <Meta label="Cost" mono value="$0.00" />
        <span className="h-[22px] w-px bg-border-subtle" />
      </div>

      {hasPendingApproval && <ApprovalPill label="1 pending" />}

      <button
        aria-label="Pause task"
        className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
        type="button"
      >
        <Pause className="h-[13px] w-[13px]" />
      </button>
      <button
        aria-label="Stop task"
        className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-status-error transition-colors duration-fast hover:bg-bg-subtle"
        type="button"
      >
        <Square className="h-[13px] w-[13px]" />
      </button>
    </header>
  );
}
