'use client';

import type { MultiAgentTraceEvent } from '@handle/shared';

export function AgentRunTrace({ trace }: { trace: MultiAgentTraceEvent[] }) {
  if (trace.length === 0) return <p className="text-[12px] text-text-muted">No trace events recorded.</p>;
  return (
    <div className="space-y-2">
      {trace.map((event, index) => (
        <div className="rounded-[8px] border border-border-subtle bg-bg-canvas p-2.5" key={`${event.timestamp}-${event.event}-${index}`}>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-text-muted">{event.event}</div>
          <div className="mt-1 text-[12px] leading-[17px] text-text-primary">{event.summary}</div>
          <div className="mt-1 text-[10.5px] text-text-tertiary">{event.role ?? event.toRole ?? 'Supervisor'} · {new Date(event.timestamp).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
}
