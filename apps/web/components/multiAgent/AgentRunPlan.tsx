'use client';

import type { AgentSubRunSummary } from '@handle/shared';

export function AgentRunPlan({ subRuns }: { subRuns: AgentSubRunSummary[] }) {
  const steps = subRuns.length > 0 ? subRuns : [];
  if (steps.length === 0) return <p className="text-[12px] text-text-muted">Plan appears once Supervisor assigns specialists.</p>;
  return (
    <ol className="space-y-2">
      {steps.map((subRun, index) => (
        <li className="flex gap-2 text-[12px]" key={subRun.id}>
          <span className="font-mono text-text-muted">{index + 1}.</span>
          <span className="text-text-secondary">{subRun.goal}</span>
        </li>
      ))}
    </ol>
  );
}
