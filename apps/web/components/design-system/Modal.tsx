import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
  title?: string;
}

export function Modal({ children, className, onClose, title }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,22,26,0.30)]">
      <div className={cn('w-[540px] overflow-hidden rounded-[18px] bg-bg-surface shadow-modal', className)}>
        {(title || onClose) && (
          <div className="flex items-center justify-between px-8 py-7">
            {title && <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>}
            {onClose && (
              <button
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-subtle hover:text-text-primary"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
