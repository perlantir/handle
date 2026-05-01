import { Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApprovalPill } from './ApprovalPill';
import { StatusDot } from './StatusDot';

interface StatusBarProps {
  className?: string;
  cost?: string;
  model?: string;
  runtime?: string;
  subtitle?: string;
  title: string;
  waiting?: boolean;
}

export function StatusBar({ className, cost = '$0.00', model = 'OpenAI', runtime = '0s', subtitle, title, waiting }: StatusBarProps) {
  return (
    <header className={cn('mt-8 flex h-14 shrink-0 items-center gap-4 px-8', className)}>
      <StatusDot status={waiting ? 'waiting' : 'running'} pulsing size="lg" />
      <div className="min-w-0">
        <h1 className="truncate text-[13.5px] font-medium text-text-primary">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-text-secondary">{subtitle}</p>}
      </div>
      <div className="ml-auto flex items-center gap-4">
        {[
          ['Model', model],
          ['Runtime', runtime],
          ['Cost', cost],
        ].map(([label, value]) => (
          <div key={label} className="border-l border-border-subtle pl-4">
            <p className="text-[10.5px] text-text-muted">{label}</p>
            <p className="text-[11.5px] font-medium text-text-primary">{value}</p>
          </div>
        ))}
        {waiting && <ApprovalPill />}
        <button className="flex h-8 w-8 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-subtle" type="button">
          <Pause className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-subtle" type="button">
          <Square className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
