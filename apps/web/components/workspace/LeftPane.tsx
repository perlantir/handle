'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlanStep, TaskDetailResponse, TaskMessage } from '@handle/shared';
import type { AgentStreamState, ToolCallState } from '@/hooks/useAgentStream';
import { cn } from '@/lib/utils';

type LeftTab = 'chat' | 'plan' | 'timeline';

interface LeftPaneProps {
  state: AgentStreamState;
  task: TaskDetailResponse | null;
}

const tabLabels: Array<[LeftTab, string]> = [
  ['chat', 'Chat'],
  ['plan', 'Plan'],
  ['timeline', 'Timeline'],
];

function TypingDots() {
  return (
    <span className="inline-flex gap-[3px] align-middle">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 rounded-pill bg-accent animate-pulse-handle"
          style={{ animationDelay: `${index * 0.18}s` }}
        />
      ))}
    </span>
  );
}

function Message({ message, working = false }: { message: Pick<TaskMessage, 'content' | 'role'>; working?: boolean }) {
  const isAgent = message.role === 'ASSISTANT' || message.role === 'SYSTEM';

  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pill text-[10px] font-semibold text-text-onAccent',
          isAgent ? 'bg-bg-inverse' : 'bg-accent',
        )}
      >
        {isAgent ? 'H' : 'Y'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] text-[11px] tracking-[0.005em] text-text-muted">
          {isAgent ? 'Handle' : 'You'}
          {working && ' · working'}
        </div>
        <div
          className={cn(
            'text-[13px] leading-[19.5px] tracking-[-0.005em] text-text-primary',
            working && 'text-text-secondary',
          )}
        >
          {message.content}
          {working && (
            <span className="ml-1.5 inline-block">
              <TypingDots />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ state, task }: LeftPaneProps) {
  const messages = useMemo(() => {
    const base = [...(task?.messages ?? [])];
    if (state.finalMessage && !base.some((message) => message.role === 'ASSISTANT' && message.content === state.finalMessage)) {
      base.push({ content: state.finalMessage, id: 'stream-final', role: 'ASSISTANT' });
    }
    return base;
  }, [state.finalMessage, task?.messages]);

  const runningTool = latestToolCall(state.toolCalls, 'running');
  const workingText = state.thought || (runningTool ? `Using ${runningTool.toolName}` : '');

  return (
    <div className="flex flex-col gap-[18px] px-5 py-1">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {workingText && <Message message={{ content: workingText, role: 'ASSISTANT' }} working />}
    </div>
  );
}

function PlanDot({ state }: { state: PlanStep['state'] }) {
  if (state === 'done') {
    return (
      <div className="relative z-10 mt-1 flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-pill bg-status-success text-text-onAccent">
        <Check className="h-2 w-2" strokeWidth={2.2} />
      </div>
    );
  }

  if (state === 'active') {
    return <div className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-pill bg-accent shadow-[0_0_0_4px_oklch(0.62_0.18_250/0.18)]" />;
  }

  return <div className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-pill border-[1.5px] border-border bg-bg-canvas" />;
}

function Plan({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="px-3 pt-1">
      <div className="relative pl-[14px]">
        {steps.length > 1 && <div className="absolute bottom-3 left-[21px] top-3 w-px bg-border-subtle" />}
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 py-2">
            <PlanDot state={step.state} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    'truncate text-[12.5px] tracking-[-0.005em]',
                    step.state === 'active' ? 'font-medium text-text-primary' : 'font-normal',
                    step.state === 'pending' ? 'text-text-muted' : 'text-text-primary',
                  )}
                >
                  {step.title}
                </span>
                {step.requiresApproval && (
                  <span className="rounded-[3px] bg-status-waiting/15 px-[5px] py-px text-[9.5px] font-semibold uppercase tracking-[0.04em] text-status-waiting">
                    Approval
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function timelineEntries(state: AgentStreamState) {
  const entries: Array<{ kind: 'plan' | 'tool' | 'browser' | 'memory'; state: 'active' | 'done' | 'error'; text: string }> = [];

  if (state.planSteps.length > 0) {
    entries.push({ kind: 'plan', state: 'done', text: `Plan generated · ${state.planSteps.length} steps` });
  }

  state.toolCalls.forEach((toolCall) => {
    entries.push({
      kind: 'tool',
      state: toolCall.status === 'running' ? 'active' : toolCall.status === 'error' ? 'error' : 'done',
      text: toolCall.toolName,
    });
  });

  if (state.finalMessage) entries.push({ kind: 'plan', state: 'done', text: 'Final response received' });
  if (state.error) entries.push({ kind: 'tool', state: 'error', text: state.error });

  return entries.slice().reverse();
}

function Timeline({ state }: { state: AgentStreamState }) {
  const colors = {
    browser: 'bg-agent-browser',
    memory: 'bg-agent-memory',
    plan: 'bg-accent',
    tool: 'bg-agent-tool',
  };
  const entries = timelineEntries(state);

  return (
    <div className="flex flex-col gap-px px-5 pt-1">
      {entries.map((entry, index) => (
        <div key={`${entry.text}-${index}`} className="flex items-baseline gap-2.5 px-1 py-2">
          <span className="w-10 shrink-0 font-mono text-[10.5px] tabular-nums text-text-muted">
            00:{String(Math.max(entries.length - index, 1)).padStart(2, '0')}
          </span>
          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill', colors[entry.kind])} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12px] leading-[17px] tracking-[-0.005em]',
              entry.kind === 'tool' && 'font-mono text-[11.5px]',
              entry.state === 'active' ? 'font-medium text-text-primary' : 'text-text-secondary',
              entry.state === 'error' && 'text-status-error',
            )}
          >
            {entry.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function latestToolCall(toolCalls: ToolCallState[], status?: ToolCallState['status']) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall && (!status || toolCall.status === status)) return toolCall;
  }
  return null;
}

export function LeftPane({ state, task }: LeftPaneProps) {
  const [tab, setTab] = useState<LeftTab>('plan');

  return (
    <aside className="flex min-h-0 flex-col border-r border-border-subtle">
      <div className="flex gap-1 px-5 py-[14px] pb-3">
        {tabLabels.map(([key, label]) => (
          <button
            key={key}
            className={cn(
              'h-7 rounded-pill border px-3 text-[12px] font-medium tracking-[-0.005em] transition-colors duration-fast',
              tab === key
                ? 'border-border-subtle bg-bg-surface text-text-primary'
                : 'border-transparent bg-transparent text-text-tertiary hover:bg-bg-subtle hover:text-text-secondary',
            )}
            onClick={() => setTab(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pb-4">
        {tab === 'chat' && <Conversation state={state} task={task} />}
        {tab === 'plan' && <Plan steps={state.planSteps} />}
        {tab === 'timeline' && <Timeline state={state} />}
      </div>
    </aside>
  );
}
