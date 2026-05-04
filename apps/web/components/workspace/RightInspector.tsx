'use client';

import { Brain, FileText, Globe, Scale, Shield } from 'lucide-react';
import type { PendingApproval, TaskDetailResponse } from '@handle/shared';
import type { AgentStreamState, ToolCallState } from '@/hooks/useAgentStream';
import { InspectorBlock, PillButton } from '@/components/design-system';
import { cn } from '@/lib/utils';

interface RightInspectorProps {
  approvals: PendingApproval[];
  onReviewApproval: (approval: PendingApproval) => void;
  state: AgentStreamState;
  task: TaskDetailResponse | null;
}

function latestToolCall(toolCalls: ToolCallState[]) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall) return toolCall;
  }
  return null;
}

function toolStatusLabel(toolCall: ToolCallState) {
  if (toolCall.status === 'running') return 'running';
  if (toolCall.status === 'error') return 'error';
  return 'done';
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallState }) {
  const status = toolStatusLabel(toolCall);

  return (
    <div className="overflow-hidden rounded-[12px] border border-border-subtle">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-canvas px-3 py-2.5">
        <span className={cn('h-1.5 w-1.5 rounded-pill', status === 'error' ? 'bg-status-error' : 'bg-accent')} />
        <span className="font-mono text-[11.5px] text-text-primary">{toolCall.toolName}</span>
        <span className="flex-1" />
        <span
          className={cn(
            'rounded-[3px] px-1.5 py-0.5 text-[10.5px] text-text-tertiary',
            status === 'running' && 'animate-shimmer-handle',
            status === 'error' && 'text-status-error',
          )}
        >
          {status}
        </span>
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-[17px] text-text-secondary">
        {JSON.stringify(toolCall.args, null, 2)}
      </pre>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="text-[12px] leading-[18px] text-text-muted">{children}</div>;
}

function ApprovalRow({ approval, onReview }: { approval: PendingApproval; onReview: (approval: PendingApproval) => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-status-waiting/20 bg-status-waiting/5 px-3 py-2.5">
      <Shield className="h-[13px] w-[13px] shrink-0 text-status-waiting" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium tracking-[-0.005em] text-text-primary">{approval.request.reason}</div>
        <div className="mt-px text-[10.5px] text-text-tertiary">{approval.status}</div>
      </div>
      {approval.status === 'pending' && (
        <PillButton className="h-6 px-2.5 text-[11px]" onClick={() => onReview(approval)} size="sm" variant="primary">
          Review
        </PillButton>
      )}
    </div>
  );
}

function CriticRow({
  review,
}: {
  review: AgentStreamState['criticReviews'][number];
}) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-bg-canvas px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Scale className="h-[12px] w-[12px] shrink-0 text-status-waiting" />
        <span
          className={cn(
            'text-[11px] font-semibold tracking-[0.02em]',
            review.verdict === 'REJECT'
              ? 'text-status-error'
              : review.verdict === 'REVISE'
                ? 'text-status-waiting'
                : 'text-status-success',
          )}
        >
          {review.verdict}
        </span>
        <span className="min-w-0 truncate text-[10.5px] text-text-tertiary">
          {review.interventionPoint}
        </span>
      </div>
      {review.reasoning && (
        <div className="mt-1.5 line-clamp-3 text-[12px] leading-[17px] text-text-secondary">
          {review.reasoning}
        </div>
      )}
    </div>
  );
}

function FileRow({ toolCall }: { toolCall: ToolCallState }) {
  const path = typeof toolCall.args.path === 'string' ? toolCall.args.path : toolCall.toolName;
  const state = toolCall.status === 'running' ? 'active' : toolCall.status === 'error' ? 'error' : 'done';
  const isTodo = path.endsWith('.todo.md');

  return (
    <div className="flex items-center gap-2.5 py-1">
      <div
        className={cn(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]',
          isTodo ? 'bg-agent-memory/15 text-agent-memory' : state === 'active' ? 'bg-accent/15 text-accent' : 'bg-bg-muted text-text-tertiary',
          state === 'error' && 'text-status-error',
        )}
      >
        <FileText className="h-[11px] w-[11px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] text-text-primary">{isTodo ? `todo.md · ${path}` : path}</div>
        <div className="text-[10.5px] text-text-muted">{isTodo ? 'sticky task plan' : state}</div>
      </div>
    </div>
  );
}

function SourceRow({ domain, sub }: { domain: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border-subtle bg-bg-canvas text-text-tertiary">
        <Globe className="h-[11px] w-[11px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] text-text-primary">{domain}</div>
        <div className="text-[10.5px] text-text-tertiary">{sub}</div>
      </div>
    </div>
  );
}

function MemoryRow({
  fact,
}: {
  fact: AgentStreamState['memoryFacts'][number];
}) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <div className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border-subtle bg-bg-canvas text-text-tertiary">
        <Brain className="h-[11px] w-[11px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[12px] leading-[17px] text-text-primary">{fact.content}</div>
        <div className="mt-px text-[10.5px] text-text-tertiary">
          {fact.source}
          {typeof fact.score === 'number' ? ` · ${fact.score.toFixed(2)}` : ''}
        </div>
      </div>
    </div>
  );
}

function sourceRows(toolCalls: ToolCallState[], task: TaskDetailResponse | null) {
  const rows = new Map<string, { domain: string; sub: string }>();

  toolCalls.forEach((toolCall) => {
    if (toolCall.toolName === 'shell.exec') {
      const backend = task?.backend === 'local' ? 'Local Mac' : 'E2B sandbox';
      rows.set('shell.exec', { domain: backend, sub: 'shell execution' });
    } else if (toolCall.toolName.startsWith('browser.')) {
      rows.set('browser', { domain: 'Browser', sub: 'browser automation' });
    } else if (toolCall.toolName.startsWith('web.')) {
      rows.set('web', { domain: 'Web search', sub: toolCall.toolName });
    } else {
      const integration = toolCall.toolName.split('.')[0] ?? '';
      if (['gmail', 'slack', 'notion', 'drive', 'github', 'calendar', 'cloudflare', 'vercel', 'linear', 'sheets', 'docs', 'zapier', 'obsidian'].includes(integration)) {
        rows.set(integration, {
          domain: integration.charAt(0).toUpperCase() + integration.slice(1),
          sub: 'integration tool',
        });
      }
    }
  });

  return Array.from(rows.values());
}

export function RightInspector({ approvals, onReviewApproval, state, task }: RightInspectorProps) {
  const latestTool = latestToolCall(state.toolCalls);
  const fileTools = state.toolCalls
    .filter((toolCall) => toolCall.toolName.startsWith('file.'))
    .sort((left, right) => {
      const leftPath = typeof left.args.path === 'string' ? left.args.path : '';
      const rightPath = typeof right.args.path === 'string' ? right.args.path : '';
      return Number(rightPath.endsWith('.todo.md')) - Number(leftPath.endsWith('.todo.md'));
    });
  const activeStepIndex = state.planSteps.findIndex((step) => step.state === 'active');
  const completedSteps = state.planSteps.filter((step) => step.state === 'done').length;
  const currentStep =
    activeStepIndex >= 0
      ? activeStepIndex + 1
      : Math.min(completedSteps, state.planSteps.length);
  const sources = sourceRows(state.toolCalls, task);

  return (
    <aside className="flex min-h-0 flex-col border-l border-border-subtle">
      <div className="flex items-center px-6 py-[14px] pb-3">
        <div className="text-[12.5px] font-medium tracking-[-0.005em] text-text-primary">Inspector</div>
        <span className="flex-1" />
        {state.planSteps.length > 0 && (
          <span className="text-[11px] text-text-muted">
            step {Math.max(currentStep, 1)} / {state.planSteps.length}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 pt-1">
        <InspectorBlock title="Current tool call">
          {latestTool ? <ToolCallCard toolCall={latestTool} /> : <EmptyState>No tool call has run for this task yet.</EmptyState>}
        </InspectorBlock>

        <InspectorBlock
          {...(state.criticReviews.length > 0 ? { badge: String(state.criticReviews.length) } : {})}
          title="Critic review"
        >
          {state.criticReviews.length === 0 ? (
            <EmptyState>No critic interventions recorded for this run.</EmptyState>
          ) : (
            state.criticReviews.map((review) => <CriticRow key={review.id} review={review} />)
          )}
        </InspectorBlock>

        <InspectorBlock {...(approvals.length > 0 ? { badge: String(approvals.length) } : {})} title="Approvals">
          {approvals.length === 0 ? (
            <EmptyState>No approval requests are pending.</EmptyState>
          ) : (
            approvals.map((approval) => (
              <ApprovalRow key={approval.approvalId} approval={approval} onReview={onReviewApproval} />
            ))
          )}
        </InspectorBlock>

        <InspectorBlock
          {...(state.memoryFacts.length > 0 ? { badge: String(state.memoryFacts.length) } : {})}
          title="Memory used"
        >
          {state.memoryFacts.length === 0 ? (
            <EmptyState>No memory recalled for this run.</EmptyState>
          ) : (
            state.memoryFacts.map((fact) => <MemoryRow fact={fact} key={`${fact.source}:${fact.content}`} />)
          )}
        </InspectorBlock>

        <InspectorBlock title="Files touched">
          {fileTools.length === 0 ? (
            <EmptyState>No file tools have run for this task.</EmptyState>
          ) : (
            fileTools.map((toolCall) => (
              <FileRow key={toolCall.callId} toolCall={toolCall} />
            ))
          )}
        </InspectorBlock>

        <InspectorBlock title="Sources">
          {sources.length === 0 ? (
            <EmptyState>No external runtime or source was used yet.</EmptyState>
          ) : (
            sources.map((source) => (
              <SourceRow domain={source.domain} key={`${source.domain}:${source.sub}`} sub={source.sub} />
            ))
          )}
        </InspectorBlock>
      </div>
    </aside>
  );
}
