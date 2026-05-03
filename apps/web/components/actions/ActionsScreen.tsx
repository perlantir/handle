"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActionLogSummary, ActionOutcomeType } from "@handle/shared";
import { History, RotateCcw, Search } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { listActions, undoAction } from "@/lib/api";
import { useHandleAuth } from "@/lib/handleAuth";
import { cn } from "@/lib/utils";

type GroupMode = "all" | "conversation" | "project";

const outcomeOptions: Array<{ label: string; value: ActionOutcomeType | "" }> = [
  { label: "All outcomes", value: "" },
  { label: "File created", value: "file_created" },
  { label: "File modified", value: "file_modified" },
  { label: "File deleted", value: "file_deleted" },
  { label: "Shell command", value: "shell_command_executed" },
  { label: "Browser navigated", value: "browser_navigated" },
  { label: "Memory saved", value: "memory_saved" },
  { label: "Memory forgotten", value: "memory_forgotten" },
];

export function ActionsScreen() {
  const { getToken, isLoaded } = useHandleAuth();
  const [actions, setActions] = useState<ActionLogSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [group, setGroup] = useState<GroupMode>("all");
  const [loading, setLoading] = useState(true);
  const [outcomeType, setOutcomeType] = useState<ActionOutcomeType | "">("");
  const [query, setQuery] = useState("");
  const [to, setTo] = useState("");
  const [undoingId, setUndoingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const loaded = await listActions({
        from,
        outcomeType,
        q: query,
        to,
        token,
      });
      setActions(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load actions");
      setActions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, getToken, isLoaded, outcomeType, query, to]);

  const groupedActions = useMemo(() => {
    if (group === "all") return [{ id: "all", label: "All actions", rows: actions }];
    const key = group === "project" ? "projectId" : "conversationId";
    const groups = new Map<string, ActionLogSummary[]>();
    for (const action of actions) {
      const id = action[key] || "unknown";
      groups.set(id, [...(groups.get(id) ?? []), action]);
    }
    return Array.from(groups.entries()).map(([id, rows]) => ({
      id,
      label: `${group === "project" ? "Project" : "Conversation"} ${id}`,
      rows,
    }));
  }, [actions, group]);

  async function handleUndo(action: ActionLogSummary) {
    setUndoingId(action.id);
    setError(null);
    try {
      const token = await getToken();
      await undoAction({ actionId: action.id, token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
        <header className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-subtle bg-bg-canvas text-accent">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-display text-[28px] font-semibold">Actions</h1>
            <p className="mt-1 text-[12px] text-text-secondary">
              Semantic outcomes Handle has produced across files, shell, browser, and memory.
            </p>
          </div>
        </header>

        <section className="grid gap-3 rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={group === "all"} onClick={() => setGroup("all")}>All</TabButton>
            <TabButton active={group === "project"} onClick={() => setGroup("project")}>By Project</TabButton>
            <TabButton active={group === "conversation"} onClick={() => setGroup("conversation")}>By Conversation</TabButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[280px] flex-1 items-center gap-2 rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px]">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search description or target"
                value={query}
              />
            </label>
            <select
              aria-label="Filter by outcome"
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setOutcomeType(event.target.value as ActionOutcomeType | "")}
              value={outcomeType}
            >
              {outcomeOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              aria-label="From date"
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
            <input
              aria-label="To date"
              className="h-9 rounded-[8px] border border-border-subtle bg-bg-base px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </div>
        </section>

        {error && (
          <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-[13px] text-text-secondary">Loading actions...</div>
        ) : groupedActions.every((item) => item.rows.length === 0) ? (
          <div className="rounded-[8px] border border-border-subtle bg-bg-canvas px-4 py-8 text-[13px] text-text-secondary">
            No actions found.
          </div>
        ) : (
          <div className="grid gap-5">
            {groupedActions.map((item) =>
              item.rows.length > 0 ? (
                <section className="grid gap-2" key={item.id}>
                  {group !== "all" && (
                    <h2 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                      {item.label}
                    </h2>
                  )}
                  <ActionsTable actions={item.rows} onUndo={handleUndo} undoingId={undoingId} />
                </section>
              ) : null,
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={cn(
        "rounded-[7px] px-3 py-1.5 text-[12px] font-medium",
        active ? "bg-bg-subtle text-text-primary" : "text-text-secondary hover:bg-bg-base",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ActionsTable({
  actions,
  onUndo,
  undoingId,
}: {
  actions: ActionLogSummary[];
  onUndo: (action: ActionLogSummary) => void;
  undoingId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-bg-canvas">
      <div className="grid grid-cols-[160px_150px_1.2fr_1fr_110px_96px] border-b border-border-subtle px-4 py-2 text-[11px] uppercase tracking-[0.04em] text-text-muted">
        <div>Timestamp</div>
        <div>Outcome</div>
        <div>Description</div>
        <div>Target</div>
        <div>Reversible</div>
        <div>Undo</div>
      </div>
      {actions.map((action) => (
        <div
          className="grid grid-cols-[160px_150px_1.2fr_1fr_110px_96px] items-center border-b border-border-subtle px-4 py-3 text-[12.5px] last:border-b-0"
          key={action.id}
        >
          <div className="text-text-secondary">{formatTimestamp(action.timestamp)}</div>
          <div className="truncate text-text-secondary">{outcomeLabel(action.outcomeType)}</div>
          <div className="min-w-0 pr-3 text-text-primary">{action.description}</div>
          <div className="min-w-0 truncate font-mono text-[11.5px] text-text-tertiary" title={action.target}>
            {action.target}
          </div>
          <div className={action.reversible ? "text-status-success" : "text-text-tertiary"}>
            {action.reversible ? "Yes" : "No"}
          </div>
          <div>
            {action.reversible ? (
              <PillButton
                aria-label={`Undo ${action.description}`}
                className="h-7 px-2.5 text-[11px]"
                disabled={undoingId === action.id}
                onClick={() => onUndo(action)}
                size="sm"
                variant="secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo
              </PillButton>
            ) : (
              <span className="text-[11px] text-text-muted">-</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function outcomeLabel(value: ActionOutcomeType) {
  return value.replaceAll("_", " ");
}
