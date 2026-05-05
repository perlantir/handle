'use client';

import type { AgentSubRunSummary } from '@handle/shared';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function statusTone(status: string) {
  if (status === 'COMPLETED') return 'text-status-success';
  if (status === 'FAILED' || status === 'REJECTED') return 'text-status-error';
  return 'text-accent';
}

export function SpecialistCard({ subRun }: { subRun: AgentSubRunSummary }) {
  const Icon = subRun.status === 'COMPLETED' ? CheckCircle2 : subRun.status === 'FAILED' ? XCircle : CircleDashed;
  return (
    <div className="rounded-[8px] border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', statusTone(subRun.status))} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-text-primary">{subRun.label}</div>
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-text-muted">{subRun.role}</div>
        </div>
        <div className={cn('text-[11px] font-medium', statusTone(subRun.status))}>{subRun.status.toLowerCase()}</div>
      </div>
      {subRun.safeSummary ? <p className="mt-2 text-[12px] leading-[17px] text-text-secondary">{subRun.safeSummary}</p> : null}
      <div className="mt-2 flex gap-3 text-[10.5px] text-text-muted">
        <span>{subRun.toolCallCount} tools</span>
        {subRun.costUsd ? <span>${subRun.costUsd}</span> : null}
      </div>
    </div>
  );
}
