import type { TaskStatus } from '@handle/shared';
import { cn } from '@/lib/utils';
import { StatusDot } from './StatusDot';

interface ContinueCardProps {
  className?: string;
  meta: string;
  status: Extract<TaskStatus, 'RUNNING' | 'WAITING' | 'STOPPED'>;
  tag?: string;
  title: string;
}

const statusLabel = {
  RUNNING: 'Running',
  STOPPED: 'Complete',
  WAITING: 'Waiting',
};

const dotStatus = {
  RUNNING: 'running',
  STOPPED: 'success',
  WAITING: 'waiting',
} as const;

export function ContinueCard({ className, meta, status, tag, title }: ContinueCardProps) {
  return (
    <article className={cn('rounded-[14px] border border-border-subtle bg-bg-surface px-5 py-[18px]', className)}>
      <div className="mb-3 flex items-center gap-2 text-[11.5px] text-text-tertiary">
        <StatusDot status={dotStatus[status]} pulsing={status === 'RUNNING'} />
        <span>{statusLabel[status]}</span>
        {tag && <span className="ml-auto rounded-pill bg-bg-subtle px-2 py-0.5 text-[10.5px] text-text-secondary">{tag}</span>}
      </div>
      <h3 className="text-[13.5px] font-medium leading-[1.4] text-text-primary">{title}</h3>
      <p className="mt-2 text-[11.5px] text-text-tertiary">{meta}</p>
    </article>
  );
}
