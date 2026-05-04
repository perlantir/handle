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

function statusLabel(status: AsyncTaskSummary["status"]) {
  return status.toLowerCase();
}

export function ContinueBand() {
  const { getToken, isLoaded } = useHandleAuth();
  const [tasks, setTasks] = useState<AsyncTaskSummary[]>([]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    getToken()
      .then((token) => listAsyncTasks({ token }))
      .then((nextTasks) => {
        if (!cancelled) setTasks(nextTasks.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  const cards =
    tasks.length > 0
      ? tasks
      : [
          {
            asyncMode: false,
            conversationId: "empty",
            goal: "No background tasks yet",
            id: "empty",
            projectName: "Handle",
            status: "COMPLETED" as const,
            workflowStatus: "Idle",
          },
        ];

  return (
    <section className="mt-auto px-16 pb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[12.5px] font-medium text-text-secondary">Continue where you left off</h2>
        <a className="text-[12px] text-text-tertiary hover:text-text-primary" href="/tasks">
          View all tasks
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((task) => (
          <a
            href={task.id === "empty" ? "/settings" : `/tasks/${task.id}`}
            key={task.id}
          >
            <ContinueCard
              meta={`${statusLabel(task.status)}${task.notificationFailed ? " · notification delivery failed" : ""}`}
              status={cardStatus(task.status)}
              tag={task.projectName ?? "Async"}
              title={task.goal}
            />
          </a>
        ))}
      </div>
    </section>
  );
}
