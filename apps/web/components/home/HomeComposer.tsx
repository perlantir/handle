"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { createTask } from "@/lib/api";

interface HomeComposerProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function HomeComposer({ onValueChange, value }: HomeComposerProps) {
  const { getToken } = useHandleAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(goal: string) {
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const { taskId } = await createTask({ goal, token });
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-[720px]">
      <Composer
        disabled={submitting}
        onSubmit={handleSubmit}
        onValueChange={onValueChange}
        placeholder="Describe what you'd like Handle to do..."
        submitDisabled={!value.trim()}
        value={value}
      />
      {error && (
        <p className="mt-3 text-center text-[12px] text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
