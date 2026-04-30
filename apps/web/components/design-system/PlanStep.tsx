import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanStepProps {
  className?: string;
  connector?: boolean;
  state: 'done' | 'active' | 'pending';
  title: string;
}

export function PlanStep({ className, connector = true, state, title }: PlanStepProps) {
  return (
    <div className={cn('relative flex gap-3 pb-4', className)}>
      <div className="relative flex w-[14px] justify-center">
        {connector && <span className="absolute left-1/2 top-[14px] h-full w-px -translate-x-1/2 bg-border-subtle" />}
        <span
          className={cn(
            'relative z-10 flex h-[14px] w-[14px] items-center justify-center rounded-pill',
            state === 'done' && 'bg-status-success text-text-onAccent',
            state === 'active' && 'bg-accent text-text-onAccent shadow-[0_0_0_4px_oklch(0.62_0.18_250/0.18)]',
            state === 'pending' && 'border-[1.5px] border-border bg-bg-canvas',
          )}
        >
          {state === 'done' && <Check className="h-[9px] w-[9px]" strokeWidth={2.2} />}
        </span>
      </div>
      <p className={cn('text-[13px] leading-[17px]', state === 'pending' ? 'text-text-tertiary' : 'text-text-primary')}>
        {title}
      </p>
    </div>
  );
}
