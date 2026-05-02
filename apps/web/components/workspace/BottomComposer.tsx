'use client';

import { ArrowUp, Mic, Paperclip, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TaskDetailResponse } from '@handle/shared';
import { sendConversationMessage } from '@/lib/api';
import { useHandleAuth } from '@/lib/handleAuth';

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

export function BottomComposer({ task }: { task: TaskDetailResponse | null }) {
  const router = useRouter();
  const { getToken } = useHandleAuth();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();
    if (!content || !task?.conversationId) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const { agentRunId } = await sendConversationMessage({
        content,
        conversationId: task.conversationId,
        ...(task.backend ? { backend: task.backend } : {}),
        ...(task.providerId ? { providerId: task.providerId } : {}),
        ...(task.providerModel ? { modelName: task.providerModel } : {}),
        token,
      });
      setValue('');
      router.push(`/tasks/${agentRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send follow-up');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-6 py-[14px]">
      <form
        className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-bg-canvas py-1 pl-4 pr-1.5"
        onSubmit={handleSubmit}
      >
        <Sparkles className="h-[13px] w-[13px] shrink-0 text-text-tertiary" />
        <input
          aria-label="Add an instruction"
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] tracking-[-0.005em] text-text-primary outline-none placeholder:text-text-tertiary"
          disabled={submitting || !task?.conversationId}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask for follow-up changes"
          type="text"
          value={value}
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
          disabled={submitting || !value.trim() || !task?.conversationId}
          type="submit"
        >
          <ArrowUp className="h-[14px] w-[14px]" />
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-status-error">{error}</p>}
    </div>
  );
}
