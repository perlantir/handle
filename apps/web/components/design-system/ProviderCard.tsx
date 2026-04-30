import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProviderCardProps {
  className?: string;
  description?: string;
  initials: string;
  name: string;
}

export function ProviderCard({ className, description, initials, name }: ProviderCardProps) {
  return (
    <article className={cn('flex items-start gap-3 rounded-[14px] border border-border-subtle bg-bg-surface p-5', className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bg-inverse text-base font-semibold text-text-onAccent">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-medium text-text-primary">{name}</h3>
        {description && <p className="mt-1 text-[12px] leading-[17px] text-text-tertiary">{description}</p>}
      </div>
      <button className="text-text-tertiary hover:text-text-primary" type="button">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </article>
  );
}
