"use client";

import { useEffect, useMemo, useState } from "react";
import type { SkillSummary } from "@handle/shared";
import { CheckCircle2, Search, Sparkles, XCircle } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { listSkills } from "@/lib/skills";
import { cn } from "@/lib/utils";

type Tab = "builtin" | "recent";

export function SkillsScreen() {
  const { getToken, isLoaded } = useHandleAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [tab, setTab] = useState<Tab>("builtin");

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const loaded = await listSkills({ q: query, token });
        if (!cancelled) setSkills(loaded);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Skills");
          setSkills([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const timer = setTimeout(() => void load(), 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [getToken, isLoaded, query]);

  const categories = useMemo(() => Array.from(new Set(skills.map((skill) => skill.category))).sort(), [skills]);
  const recent = skills.filter((skill) => skill.recentRun);

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-subtle bg-bg-canvas text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Skills</h1>
              <p className="mt-1 text-[12px] text-text-secondary">
                Inspectable workflow packages with policies, traces, and artifacts.
              </p>
            </div>
          </div>
          <PillButton disabled variant="secondary">Create Skill in Stage 2</PillButton>
        </header>

        <section className="grid gap-3 rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={tab === "builtin"} onClick={() => setTab("builtin")}>Built-in</TabButton>
            <TabButton active={tab === "recent"} onClick={() => setTab("recent")}>Recent Runs</TabButton>
            <TabButton active={false} disabled onClick={() => undefined}>Personal</TabButton>
            <TabButton active={false} disabled onClick={() => undefined}>Project</TabButton>
            <TabButton active={false} disabled onClick={() => undefined}>Workflows</TabButton>
            <TabButton active={false} disabled onClick={() => undefined}>Scheduled</TabButton>
          </div>
          <label className="flex min-w-[280px] flex-1 items-center gap-2 rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px]">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Skills"
              value={query}
            />
          </label>
          <div className="flex flex-wrap gap-2 text-[11.5px] text-text-tertiary">
            {categories.map((category) => (
              <span className="rounded-pill border border-border-subtle px-2 py-1 capitalize" key={category}>{category}</span>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-[13px] text-text-secondary">Loading Skills...</div>
        ) : tab === "recent" ? (
          <RecentRunGrid skills={recent} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function SkillCard({ skill }: { skill: SkillSummary }) {
  return (
    <a className="block rounded-[8px] border border-border-subtle bg-bg-canvas p-4 transition hover:border-border-strong" href={`/skills/${skill.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-subtle bg-bg-subtle text-[13px] font-semibold text-text-primary">
            {skill.icon.value}
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-text-primary">{skill.name}</h2>
            <p className="mt-0.5 text-[11.5px] capitalize text-text-tertiary">{skill.category} · {skill.visibility.toLowerCase()}</p>
          </div>
        </div>
        <StatusBadge skill={skill} />
      </div>
      <p className="mt-3 min-h-[44px] text-[12.5px] leading-5 text-text-secondary">{skill.description}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {skill.requiredIntegrations.length === 0 ? (
          <span className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-tertiary">No required integrations</span>
        ) : (
          skill.requiredIntegrations.map((connector) => (
            <span className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-tertiary" key={connector}>{connector}</span>
          ))
        )}
      </div>
      <div className="mt-4 text-[11.5px] text-text-tertiary">
        {skill.runCount} run(s){skill.recentRun ? ` · last ${skill.recentRun.status.toLowerCase()}` : ""}
      </div>
    </a>
  );
}

function RecentRunGrid({ skills }: { skills: SkillSummary[] }) {
  if (skills.length === 0) {
    return (
      <div className="rounded-[8px] border border-border-subtle bg-bg-canvas px-4 py-8 text-[13px] text-text-secondary">
        No Skill runs yet.
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {skills.map((skill) => skill.recentRun ? (
        <a className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4" href={`/skill-runs/${skill.recentRun.id}`} key={skill.recentRun.id}>
          <div className="text-[13px] font-medium text-text-primary">{skill.name}</div>
          <div className="mt-1 text-[12px] text-text-tertiary">{skill.recentRun.status.toLowerCase()} · {skill.recentRun.resultSummary ?? "No summary yet"}</div>
        </a>
      ) : null)}
    </div>
  );
}

function StatusBadge({ skill }: { skill: SkillSummary }) {
  const ready = skill.status === "ready";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium", ready ? "bg-status-success/10 text-status-success" : "bg-status-warning/10 text-status-warning")}>
      {ready ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ready ? "Ready" : skill.status === "needs_integration" ? "Needs integration" : "Disabled"}
    </span>
  );
}

function TabButton({ active, children, disabled = false, onClick }: { active: boolean; children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        "rounded-[7px] px-3 py-1.5 text-[12px] font-medium",
        active ? "bg-bg-subtle text-text-primary" : "text-text-secondary hover:bg-bg-base",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
