import { cn } from '@/lib/utils';

interface InspectorBlockProps {
  badge?: string;
  children?: React.ReactNode;
  className?: string;
  title: string;
}

export function InspectorBlock({ badge, children, className, title }: InspectorBlockProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">{title}</h3>
        {badge && <span className="rounded-pill bg-bg-subtle px-2 py-0.5 text-[10.5px] text-text-tertiary">{badge}</span>}
      </div>
      {children}
    </section>
  );
}
