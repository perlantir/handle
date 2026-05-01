import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalPillProps {
  className?: string;
  label?: string;
  showIcon?: boolean;
}

export function ApprovalPill({ className, label = 'Needs approval', showIcon = true }: ApprovalPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-pill bg-status-waiting/15 px-[9px] text-[11px] font-medium leading-[14px] text-status-waiting',
        className,
      )}
    >
      {showIcon && <Shield className="h-[11px] w-[11px]" strokeWidth={1.8} />}
      {label}
    </span>
  );
}
