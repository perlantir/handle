"use client";

import { useEffect, useState } from "react";
import type { AsyncTaskSummary } from "@handle/shared";
import { ContinueCard } from "@/components/design-system";
import { listAsyncTasks } from "@/lib/api";
import { useHandleAuth } from "@/lib/handleAuth";

function cardStatus(status: AsyncTaskSummary["status"]) {
  if (status === "COMPLETED") return "STOPPED";
  if (status === "FAILED" || status === "CANCELLED") return "ERROR";
  return status;
}

function timestamp(value?: string | null) {
  if (!value) return "Not started";
  return new Date(value).toLocaleString();
}

export function AsyncTasksScreen() {
  const { getToken, isLoaded } = useHandleAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<AsyncTaskSummary[]>([]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    getToken()
      .then((token) => listAsyncTasks({ token }))
      .then((nextTasks) => {
        if (!cancelled) {
          setTasks(nextTasks);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tasks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  return (
    <div className="mx-auto flex min-h-full max-w-[980px] flex-col px-10 py-10">
      <header className="mb-7">
        <h1 className="m-0 font-display text-[22px] font-medium tracking-[-0.02em] text-text-primary">
          Tasks
        </h1>
        <p className="m-0 mt-2 text-[12.5px] text-text-tertiary">
          Running, paused, waiting, and recent async Handle work.
        </p>
      </header>

      {loading ? (
        <div className="text-[12.5px] text-text-tertiary">Loading tasks</div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12.5px] text-status-error">
          {error}
        </div>
      ) : null}
      {!loading && !error && tasks.length === 0 ? (
        <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-6 text-[12.5px] text-text-tertiary">
          No background tasks yet.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <a href={`/tasks/${task.id}`} key={task.id}>
            <ContinueCard
              meta={`${task.workflowStatus ?? task.projectName ?? "Background"} · ${timestamp(task.queuedAt ?? task.startedAt)}`}
              status={cardStatus(task.status)}
              tag={task.projectName ?? "Async"}
              title={task.goal}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
