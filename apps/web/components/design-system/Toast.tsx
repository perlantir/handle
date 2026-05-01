import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Toast({ children, className, title }: ToastProps) {
  return (
    <div className={cn('flex gap-2.5 rounded-[10px] border border-status-waiting/20 bg-status-waiting/5 px-3 py-2.5', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-waiting" />
      <div>
        {title && <p className="text-[12px] font-medium text-text-primary">{title}</p>}
        <div className="text-[12px] leading-[17px] text-text-secondary">{children}</div>
      </div>
    </div>
  );
}
