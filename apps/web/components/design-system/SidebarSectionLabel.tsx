import { cn } from '@/lib/utils';

interface SidebarSectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarSectionLabel({ children, className }: SidebarSectionLabelProps) {
  return (
    <div className={cn('px-6 pb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-text-muted', className)}>
      {children}
    </div>
  );
}
