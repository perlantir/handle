import { ArrowUp, Mic, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PillButton } from './PillButton';

interface ComposerProps {
  className?: string;
  onSubmit?: (value: string) => void;
  placeholder?: string;
}

export function Composer({ className, placeholder = 'Ask Handle to do something...', onSubmit }: ComposerProps) {
  return (
    <form
      className={cn('rounded-[18px] border border-border-subtle bg-bg-surface px-[22px] pb-[14px] pt-5', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const value = String(data.get('goal') ?? '').trim();
        if (value) onSubmit?.(value);
      }}
    >
      <textarea
        name="goal"
        rows={3}
        className="min-h-[76px] w-full resize-none bg-transparent text-[15px] leading-[22px] text-text-primary outline-none placeholder:text-text-tertiary"
        placeholder={placeholder}
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PillButton type="button" variant="ghost" icon={<Paperclip className="h-[13px] w-[13px]" />}>
            Attach
          </PillButton>
          <PillButton type="button" variant="ghost" icon={<Mic className="h-[13px] w-[13px]" />}>
            Voice
          </PillButton>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-pill bg-bg-inverse text-text-onAccent transition-colors duration-fast hover:bg-text-primary"
          type="submit"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </form>
  );
}
