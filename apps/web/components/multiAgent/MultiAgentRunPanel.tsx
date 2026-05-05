'use client';

import type { AgentHandoffSummary, AgentSubRunSummary, MultiAgentTraceEvent } from '@handle/shared';
import { GitBranch } from 'lucide-react';
import { AgentRunPlan } from './AgentRunPlan';
import { AgentRunTrace } from './AgentRunTrace';
import { HandoffList } from './HandoffList';
import { SpecialistCard } from './SpecialistCard';

export function MultiAgentRunPanel({
  handoffs = [],
  subRuns = [],
  trace = [],
}: {
  handoffs?: AgentHandoffSummary[];
  subRuns?: AgentSubRunSummary[];
  trace?: MultiAgentTraceEvent[];
}) {
  const visible = subRuns.length > 0 || trace.length > 0 || handoffs.length > 0;
  if (!visible) return null;

  return (
    <section className="mb-3 rounded-[10px] border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-accent" />
        <h2 className="text-[13px] font-semibold text-text-primary">Multi-agent run</h2>
        <span className="rounded-pill bg-bg-subtle px-2 py-0.5 text-[10.5px] text-text-muted">{subRuns.length} specialist(s)</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Specialists</div>
          <div className="space-y-2">{subRuns.map((subRun) => <SpecialistCard key={subRun.id} subRun={subRun} />)}</div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Plan</div>
            <AgentRunPlan subRuns={subRuns} />
          </div>
          <div>
            <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Handoffs</div>
            <HandoffList handoffs={handoffs} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Trace</div>
        <AgentRunTrace trace={trace.slice(-8)} />
      </div>
    </section>
  );
}
