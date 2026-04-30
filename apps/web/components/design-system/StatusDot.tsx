import { cn } from '@/lib/utils';

interface StatusDotProps {
  className?: string;
  pulsing?: boolean;
  size?: 'sm' | 'default' | 'lg';
  status: 'running' | 'waiting' | 'success' | 'error' | 'paused';
}

export function StatusDot({ className, pulsing = false, size = 'default', status }: StatusDotProps) {
  const sizes = { sm: 'h-[5px] w-[5px]', default: 'h-[7px] w-[7px]', lg: 'h-2 w-2' };
  const colors = {
    error: 'bg-status-error',
    paused: 'bg-status-paused',
    running: 'bg-status-running',
    success: 'bg-status-success',
    waiting: 'bg-status-waiting',
  };

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span className={cn('rounded-pill', sizes[size], colors[status])} />
      {pulsing && (
        <span
          className={cn('animate-pulse-handle absolute inset-0 rounded-pill opacity-30', colors[status])}
          style={{ transform: 'scale(2)' }}
        />
      )}
    </span>
  );
}
