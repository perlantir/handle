import Link from "next/link";
import type { AgentRunSummary } from "@handle/shared";
import { StatusDot } from "@/components/design-system";
import { getHandleServerToken } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const apiBaseUrl =
  process.env.HANDLE_API_BASE_URL ??
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ??
  "http://127.0.0.1:3001";

const statusView = {
  CANCELLED: { dot: "paused", label: "Cancelled" },
  COMPLETED: { dot: "success", label: "Completed" },
  FAILED: { dot: "error", label: "Failed" },
  PAUSED: { dot: "paused", label: "Paused" },
  QUEUED: { dot: "waiting", label: "Queued" },
  RUNNING: { dot: "running", label: "Running" },
  WAITING: { dot: "waiting", label: "Awaiting approval" },
} as const satisfies Record<AgentRunSummary["status"], { dot: "error" | "paused" | "running" | "success" | "waiting"; label: string }>;

function formatWhen(value?: string | null) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function loadTasks(): Promise<AgentRunSummary[]> {
  const token = await getHandleServerToken();
  if (!token) return [];

  const response = await fetch(`${apiBaseUrl}/api/agent-runs`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!response?.ok) return [];
  const body = (await response.json()) as { runs?: AgentRunSummary[] };
  return body.runs ?? [];
}

export default async function TasksPage() {
  const tasks = await loadTasks();

  return (
    <main className="min-h-full bg-bg-canvas px-8 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted">Task history</div>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-primary">Tasks</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[20px] text-text-secondary">
              Running, paused, waiting, and completed agent runs across your Handle projects.
            </p>
          </div>
          <Link
            className="rounded-pill border border-border-subtle bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-bg-subtle"
            href="/"
          >
            New task
          </Link>
        </header>

        {tasks.length === 0 ? (
          <section className="rounded-[10px] border border-border-subtle bg-bg-surface p-6">
            <h2 className="text-[15px] font-semibold text-text-primary">No tasks yet</h2>
            <p className="mt-2 text-[13px] leading-[20px] text-text-secondary">
              Start a task from Home and it will appear here with its status, project, and run link.
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[10px] border border-border-subtle bg-bg-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_160px_150px_130px] gap-4 border-b border-border-subtle px-5 py-3 text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
              <span>Task</span>
              <span>Status</span>
              <span>Runtime</span>
              <span>Started</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {tasks.map((task) => {
                const status = statusView[task.status] ?? statusView.RUNNING;
                return (
                  <Link
                    className="grid grid-cols-[minmax(0,1fr)_160px_150px_130px] gap-4 px-5 py-4 transition-colors duration-fast hover:bg-bg-subtle"
                    href={`/tasks/${task.id}`}
                    key={task.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-text-primary">{task.goal}</span>
                      <span className="mt-1 block truncate text-[11.5px] text-text-tertiary">
                        {task.conversationId}
                        {task.workflowStatus ? ` · ${task.workflowStatus}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-[12px] text-text-secondary">
                      <StatusDot status={status.dot} pulsing={task.status === "RUNNING"} />
                      {status.label}
                    </span>
                    <span className="text-[12px] text-text-secondary">
                      {task.backend === "LOCAL" ? "Local" : "E2B"}
                      {task.providerId ? ` · ${task.providerId}` : ""}
                    </span>
                    <span className="text-[12px] text-text-tertiary">{formatWhen(task.startedAt)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
