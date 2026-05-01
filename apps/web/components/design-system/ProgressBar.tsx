import { cn } from '@/lib/utils';

interface ProgressBarProps {
  className?: string;
  value: number;
}

export function ProgressBar({ className, value }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('h-1 overflow-hidden rounded-[2px] bg-bg-muted', className)}>
      <div
        className={cn('h-full rounded-[2px]', clamped >= 100 ? 'bg-status-success' : 'bg-accent')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
