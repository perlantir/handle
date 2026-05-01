'use client';

import { cn } from '@/lib/utils';

interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
}

export function Toggle({ checked, className, type = 'button', ...props }: ToggleProps) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'relative h-[18px] w-8 rounded-[9px] transition-colors duration-base ease-handle-ease',
        checked ? 'bg-accent' : 'bg-bg-muted',
        className,
      )}
      role="switch"
      type={type}
      {...props}
    >
      <span
        className={cn(
          'absolute top-0.5 h-[14px] w-[14px] rounded-pill bg-bg-surface transition-transform duration-base ease-handle-ease',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
