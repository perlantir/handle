"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { createTask } from "@/lib/api";
import {
  getExecutionSettings,
  type ExecutionBackend,
} from "@/lib/settingsExecution";
import { cn } from "@/lib/utils";

interface HomeComposerProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function HomeComposer({ onValueChange, value }: HomeComposerProps) {
  const { getToken } = useHandleAuth();
  const router = useRouter();
  const [backend, setBackend] = useState<ExecutionBackend>("e2b");
  const [error, setError] = useState<string | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getExecutionSettings()
      .then((settings) => {
        if (!cancelled) setBackend(settings.defaultBackend);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingBackend(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(goal: string) {
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const { taskId } = await createTask({ backend, goal, token });
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-[720px]">
      <div className="mb-2 flex justify-end">
        <div
          aria-label="Task backend"
          className="inline-flex rounded-pill border border-border-subtle bg-bg-surface p-0.5"
          role="group"
        >
          {[
            { label: "E2B", value: "e2b" },
            { label: "Local", value: "local" },
          ].map((option) => {
            const active = backend === option.value;

            return (
              <button
                className={cn(
                  "rounded-pill px-3 py-1 text-[11.5px] transition-colors duration-fast",
                  active
                    ? "bg-bg-inverse text-text-onAccent"
                    : "text-text-secondary hover:bg-bg-subtle",
                )}
                disabled={loadingBackend || submitting}
                key={option.value}
                onClick={() => setBackend(option.value as ExecutionBackend)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
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
