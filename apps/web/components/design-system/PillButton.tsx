import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ children, className, icon, size = 'default', type = 'button', variant = 'secondary', ...props }, ref) => {
    const sizes = {
      sm: 'h-[30px] px-3 text-[12.5px]',
      default: 'h-[34px] px-3.5 text-[13px]',
      lg: 'h-[38px] px-[18px] text-[13px]',
    };
    const variants = {
      primary: 'bg-bg-inverse text-text-onAccent hover:bg-text-primary',
      secondary: 'border border-border-subtle bg-bg-surface text-text-primary hover:bg-bg-subtle',
      ghost: 'bg-transparent text-text-secondary hover:bg-bg-subtle',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center gap-[7px] rounded-pill font-medium transition-colors duration-fast',
          sizes[size],
          variants[variant],
          className,
        )}
        type={type}
        {...props}
      >
        {icon && <span className="text-[13px]">{icon}</span>}
        {children}
      </button>
    );
  },
);

PillButton.displayName = 'PillButton';
