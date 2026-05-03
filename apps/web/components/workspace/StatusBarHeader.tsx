'use client';

import { Pause, Square } from 'lucide-react';
import type { TaskDetailResponse, TaskStatus } from '@handle/shared';
import type { AgentStreamState, ToolCallState } from '@/hooks/useAgentStream';
import { cn } from '@/lib/utils';
import { ApprovalPill, StatusDot } from '@/components/design-system';

interface StatusBarHeaderProps {
  cancelling?: boolean;
  onCancel?: () => void;
  onPause?: () => void;
  pausing?: boolean;
  state: AgentStreamState;
  task: TaskDetailResponse | null;
}

function dotStatus(status: AgentStreamState['status'] | TaskStatus) {
  if (status === 'ERROR') return 'error';
  if (status === 'CANCELLED') return 'paused';
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
  if (state.status === 'CANCELLED') return 'Cancelled';
  if (state.status === 'PAUSED') return 'Paused';
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

function backendLabel(backend: TaskDetailResponse['backend']) {
  return backend === 'local' ? 'Local' : 'E2B';
}

function backendTooltip(backend: TaskDetailResponse['backend']) {
  return backend === 'local'
    ? 'This task is using the Local Mac execution backend.'
    : 'This task is using the E2B Cloud execution backend.';
}

function providerLabel(providerId: string | null | undefined) {
  if (providerId === 'anthropic') return 'Anthropic';
  if (providerId === 'kimi') return 'KIMI';
  if (providerId === 'openrouter') return 'OpenRouter';
  if (providerId === 'local') return 'Local';
  if (providerId === 'openai') return 'OpenAI';
  return 'Selecting';
}

function modelValue(task: TaskDetailResponse | null) {
  const provider = providerLabel(task?.providerId);
  return task?.providerModel ? `${provider} · ${task.providerModel}` : provider;
}

export function StatusBarHeader({ cancelling = false, onCancel, onPause, pausing = false, state, task }: StatusBarHeaderProps) {
  const status = state.status === 'IDLE' && task ? task.status : state.status;
  const hasPendingApproval = state.status === 'WAITING' || Boolean(state.pendingApproval);
  const backend = task?.backend ?? 'e2b';
  const isActive = status === 'RUNNING' || status === 'WAITING';

  return (
    <header className="mt-8 flex h-14 shrink-0 items-center gap-[14px] border-b border-border-subtle px-8 pr-6">
      <StatusDot
        status={dotStatus(status)}
        pulsing={status !== 'STOPPED' && status !== 'ERROR' && status !== 'CANCELLED' && status !== 'PAUSED'}
        size="lg"
      />
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-text-primary">
          {task?.projectName ?? 'Project'}
        </h1>
        <p className="truncate text-[11px] text-text-tertiary">
          {task?.conversationTitle ? (
            <span className="mr-2 text-text-muted">{task.conversationTitle}</span>
          ) : null}
          <span className={cn(status === 'ERROR' ? 'text-status-error' : 'text-accent', 'font-medium')}>{statusSubtitle(state)}</span>
        </p>
      </div>

      <span className="flex-1" />

      <div className="hidden items-center gap-4 lg:flex">
        <span
          className="rounded-pill border border-border-subtle bg-bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary"
          title={backendTooltip(backend)}
        >
          {backendLabel(backend)}
        </span>
        <span className="h-[22px] w-px bg-border-subtle" />
        <Meta label="Model" value={modelValue(task)} />
        <span className="h-[22px] w-px bg-border-subtle" />
        <Meta label="Runtime" mono value="Live" />
        <span className="h-[22px] w-px bg-border-subtle" />
        <Meta label="Cost" mono value="$0.00" />
        <span className="h-[22px] w-px bg-border-subtle" />
      </div>

      {hasPendingApproval && <ApprovalPill label="1 pending" />}

      {isActive ? (
        <button
          aria-label="Pause task"
          className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle disabled:opacity-60"
          disabled={pausing}
          onClick={onPause}
          type="button"
        >
          <Pause className="h-[13px] w-[13px]" />
        </button>
      ) : null}
      {isActive ? (
        <button
          aria-label="Stop task"
          className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-status-error transition-colors duration-fast hover:bg-bg-subtle disabled:opacity-60"
          disabled={cancelling}
          onClick={onCancel}
          type="button"
        >
          <Square className="h-[13px] w-[13px]" />
        </button>
      ) : null}
    </header>
  );
}
