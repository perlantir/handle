import { cn } from '@/lib/utils';

interface ModePillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ReactNode;
}

export function ModePill({ active = false, children, className, icon, ...props }: ModePillProps) {
  return (
    <button
      className={cn(
        'inline-flex h-[34px] items-center gap-[7px] rounded-pill border px-[14px] text-[13px] font-medium transition-colors duration-fast',
        active ? 'border-text-primary text-text-primary' : 'border-border-subtle text-text-secondary hover:bg-bg-subtle',
        className,
      )}
      type="button"
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
