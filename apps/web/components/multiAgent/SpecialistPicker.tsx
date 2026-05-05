'use client';

import type { AgentExecutionMode } from '@handle/shared';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export const specialistOptions: Array<{ description: string; label: string; value: AgentExecutionMode }> = [
  { description: 'Supervisor routes or escalates', label: 'Auto', value: 'AUTO' },
  { description: 'Source-backed research', label: 'Researcher', value: 'RESEARCHER' },
  { description: 'Code and PR work', label: 'Coder', value: 'CODER' },
  { description: 'UI and design critique', label: 'Designer', value: 'DESIGNER' },
  { description: 'Browser and integrations', label: 'Operator', value: 'OPERATOR' },
  { description: 'Drafting and reports', label: 'Writer', value: 'WRITER' },
  { description: 'Team from the start', label: 'Multi-agent team', value: 'MULTI_AGENT_TEAM' },
];

export function SpecialistPicker({
  className,
  disabled,
  onChange,
  value = 'AUTO',
}: {
  className?: string;
  disabled?: boolean;
  onChange: (value: AgentExecutionMode) => void;
  value?: AgentExecutionMode;
}) {
  return (
    <label
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-pill border border-border-subtle bg-bg-surface px-3 text-[11.5px] text-text-secondary',
        className,
      )}
    >
      <GitBranch className="h-3.5 w-3.5 text-text-tertiary" />
      <span>Agent</span>
      <select
        aria-label="Specialist mode"
        className="bg-transparent text-text-primary outline-none"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as AgentExecutionMode)}
        value={value}
      >
        {specialistOptions.map((option) => (
          <option key={option.value} title={option.description} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
