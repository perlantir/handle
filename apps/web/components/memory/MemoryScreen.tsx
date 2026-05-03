"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MemoryFactSummary, ProjectSummary } from "@handle/shared";
import { Brain, Circle, List, Network, Search, Trash2 } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { deleteMemorySession, listMemoryFacts, listProjects } from "@/lib/api";
import { useHandleAuth } from "@/lib/handleAuth";
import { cn } from "@/lib/utils";

type ScopeTab = "all" | "global" | string;
type ViewMode = "graph" | "list";

export function MemoryScreen() {
  const { getToken, isLoaded } = useHandleAuth();
  const [facts, setFacts] = useState<MemoryFactSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeTab>("all");
  const [status, setStatus] = useState<{ provider?: string; status: "online" | "offline"; detail?: string }>({
    status: "offline",
  });
  const [view, setView] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<MemoryFactSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const token = await getToken();
      const memoryScope = scope === "global" ? "global" : scope === "all" ? "all" : "project";
      const memoryInput = {
        scope: memoryScope,
        token,
        ...(scope !== "all" && scope !== "global" ? { projectId: scope } : {}),
      } as const;
      const [loadedProjects, memory] = await Promise.all([
        listProjects({ token }).catch(() => []),
        listMemoryFacts(memoryInput),
      ]);
      if (cancelled) return;
      setProjects(loadedProjects);
      setFacts(memory.facts);
      setStatus(memory.status);
      setLoading(false);
    }
    void load().catch(() => {
      if (!cancelled) {
        setFacts([]);
        setStatus({ status: "offline", detail: "Memory API unavailable" });
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, scope]);

  const filteredFacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return facts;
    return facts.filter((fact) =>
      [fact.content, fact.sourceLabel, fact.type].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [facts, query]);

  async function deleteFact(fact: MemoryFactSummary) {
    if (!window.confirm(`Delete memory namespace "${fact.sourceLabel}"?`)) return;
    const token = await getToken();
    await deleteMemorySession({ sessionId: fact.sessionId, token });
    setFacts((current) => current.filter((item) => item.sessionId !== fact.sessionId));
    if (selected?.sessionId === fact.sessionId) setSelected(null);
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-8 py-8">
        <section className="min-w-0 flex-1">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-subtle bg-bg-canvas text-accent">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Memory</h1>
              <div className="mt-1 flex items-center gap-2 text-[12px] text-text-secondary">
                <Circle
                  className={cn(
                    "h-2.5 w-2.5 fill-current",
                    status.status === "online" ? "text-status-success" : "text-status-error",
                  )}
                />
                {status.status === "online" ? "Memory online" : "Memory offline"}
                {status.provider ? ` · ${status.provider}` : ""}
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            <TabButton active={scope === "all"} onClick={() => setScope("all")}>All</TabButton>
            <TabButton active={scope === "global"} onClick={() => setScope("global")}>Global</TabButton>
            {projects.map((project) => (
              <TabButton active={scope === project.id} key={project.id} onClick={() => setScope(project.id)}>
                {project.name}
              </TabButton>
            ))}
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-2 text-[13px]">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search memory"
                value={query}
              />
            </label>
            <div className="flex rounded-[8px] border border-border-subtle bg-bg-canvas p-1">
              <IconTab active={view === "list"} icon={<List className="h-4 w-4" />} label="List" onClick={() => setView("list")} />
              <IconTab active={view === "graph"} icon={<Network className="h-4 w-4" />} label="Graph" onClick={() => setView("graph")} />
            </div>
          </div>

          {status.status === "offline" && (
            <div className="mb-5 rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-text-secondary">
              Memory is offline. Agents continue without recall or writes.
              {status.detail ? ` ${status.detail}` : ""}
            </div>
          )}

          {view === "list" ? (
            <MemoryTable facts={filteredFacts} loading={loading} onDelete={deleteFact} onSelect={setSelected} />
          ) : (
            <MemoryGraph facts={filteredFacts} onSelect={setSelected} />
          )}
        </section>

        <aside className="hidden w-[320px] shrink-0 border-l border-border-subtle pl-6 lg:block">
          <DetailPanel fact={selected} />
        </aside>
      </div>
    </main>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={cn(
        "rounded-[7px] px-3 py-1.5 text-[12px] font-medium",
        active ? "bg-bg-subtle text-text-primary" : "text-text-secondary hover:bg-bg-canvas",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function IconTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className={cn("rounded-[6px] px-2.5 py-1.5", active ? "bg-bg-subtle text-text-primary" : "text-text-secondary")}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function MemoryTable({
  facts,
  loading,
  onDelete,
  onSelect,
}: {
  facts: MemoryFactSummary[];
  loading: boolean;
  onDelete: (fact: MemoryFactSummary) => void;
  onSelect: (fact: MemoryFactSummary) => void;
}) {
  if (loading) return <div className="text-[13px] text-text-secondary">Loading memory...</div>;
  if (facts.length === 0) return <div className="text-[13px] text-text-secondary">No memory facts found.</div>;

  return (
    <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-bg-canvas">
      <div className="grid grid-cols-[1fr_140px_120px_90px_110px] border-b border-border-subtle px-4 py-2 text-[11px] uppercase tracking-[0.04em] text-text-muted">
        <div>Fact</div>
        <div>Source</div>
        <div>Validity</div>
        <div>Confidence</div>
        <div>Actions</div>
      </div>
      {facts.slice(0, 100).map((fact) => (
        <div
          className={cn(
            "grid w-full grid-cols-[1fr_140px_120px_90px_110px] items-center border-b border-border-subtle px-4 py-3 text-left text-[13px] last:border-b-0 hover:bg-bg-subtle/50",
            fact.invalidAt && "opacity-60",
          )}
          key={fact.id}
          onClick={() => onSelect(fact)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(fact);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="min-w-0 pr-4 text-text-primary">{fact.content}</div>
          <div className="truncate text-text-secondary">{fact.sourceLabel}</div>
          <div className="text-text-secondary">{validityLabel(fact)}</div>
          <div className="text-text-secondary">{Math.round(fact.confidence * 100)}%</div>
          <div>
            <PillButton
              aria-label={`Delete memory ${fact.sourceLabel}`}
              className="h-7 px-2.5 text-[11px]"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(fact);
              }}
              size="sm"
              variant="secondary"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </PillButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryGraph({ facts, onSelect }: { facts: MemoryFactSummary[]; onSelect: (fact: MemoryFactSummary) => void }) {
  return (
    <div className="min-h-[420px] rounded-[8px] border border-border-subtle bg-bg-canvas p-6">
      <div className="relative h-[360px]">
        {facts.slice(0, 20).map((fact, index) => (
          <button
            className="absolute max-w-[180px] rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-left text-[12px] shadow-sm hover:border-accent"
            key={fact.id}
            onClick={() => onSelect(fact)}
            style={{
              left: `${8 + (index % 4) * 23}%`,
              top: `${10 + Math.floor(index / 4) * 18}%`,
            }}
            type="button"
          >
            <div className="truncate text-text-primary">{fact.content}</div>
            <div className="mt-1 text-[10px] text-text-muted">{fact.sourceLabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ fact }: { fact: MemoryFactSummary | null }) {
  if (!fact) {
    return <div className="text-[13px] leading-[19px] text-text-muted">Select a memory fact to inspect details.</div>;
  }
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.04em] text-text-muted">Detail</div>
      <div className="text-[14px] leading-[21px] text-text-primary">{fact.content}</div>
      <div className="mt-4 space-y-2 text-[12px] text-text-secondary">
        <div>Source: {fact.sourceLabel}</div>
        <div>Type: {fact.type}</div>
        <div>Confidence: {Math.round(fact.confidence * 100)}%</div>
        <div>Validity: {validityLabel(fact)}</div>
        <div>Updated: {new Date(fact.lastUpdated).toLocaleString()}</div>
      </div>
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.04em] text-text-muted">Timeline</div>
        <div className="space-y-2 text-[12px] text-text-secondary">
          <div>{fact.validAt ? `Became valid ${formatDate(fact.validAt)}` : "Validity start unknown"}</div>
          {fact.invalidAt ? (
            <div>Marked historical {formatDate(fact.invalidAt)}</div>
          ) : (
            <div>Current fact</div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function validityLabel(fact: MemoryFactSummary) {
  const since = fact.validAt ? `since ${formatDate(fact.validAt)}` : "validity unknown";
  return fact.invalidAt ? `${since} (historical)` : since;
}
