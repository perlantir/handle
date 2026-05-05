'use client';

import type { AgentHandoffSummary } from '@handle/shared';
import { ArrowRight } from 'lucide-react';

export function HandoffList({ handoffs }: { handoffs: AgentHandoffSummary[] }) {
  if (handoffs.length === 0) {
    return <p className="text-[12px] text-text-muted">No handoffs recorded yet.</p>;
  }
  return (
    <div className="space-y-2">
      {handoffs.map((handoff) => (
        <div className="flex items-start gap-2 rounded-[8px] border border-border-subtle bg-bg-canvas p-2.5" key={handoff.id}>
          <div className="font-mono text-[11px] text-text-secondary">{handoff.fromRole}</div>
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-text-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-text-primary">{handoff.toRole}</div>
            <div className="mt-1 text-[11px] leading-[15px] text-text-muted">{handoff.reason}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
