'use client';

import { ArrowUp, Mic, Paperclip, Sparkles } from 'lucide-react';

function IconButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-subtle bg-bg-surface text-text-secondary transition-colors duration-fast hover:bg-bg-subtle"
      type="button"
    >
      {children}
    </button>
  );
}

export function BottomComposer() {
  return (
    <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-6 py-[14px]">
      <form
        className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-bg-canvas py-1 pl-4 pr-1.5"
        onSubmit={(event) => event.preventDefault()}
      >
        <Sparkles className="h-[13px] w-[13px] shrink-0 text-text-tertiary" />
        <input
          aria-label="Add an instruction"
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] tracking-[-0.005em] text-text-primary outline-none placeholder:text-text-tertiary"
          placeholder="Add an instruction mid-task — Handle will weave it in."
          type="text"
        />
        <IconButton label="Attach file">
          <Paperclip className="h-[13px] w-[13px]" />
        </IconButton>
        <IconButton label="Voice input">
          <Mic className="h-[13px] w-[13px]" />
        </IconButton>
        <button
          aria-label="Send instruction"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-pill bg-bg-inverse text-text-onAccent transition-colors duration-fast hover:bg-text-primary"
          type="submit"
        >
          <ArrowUp className="h-[14px] w-[14px]" />
        </button>
      </form>
    </div>
  );
}
