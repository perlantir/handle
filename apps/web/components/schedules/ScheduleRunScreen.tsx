"use client";

import { useEffect, useState } from "react";
import type { ScheduleRunDetail } from "@handle/shared";
import { ArrowLeft, Box, CheckCircle2, ExternalLink, FileText, HeartPulse, Loader2, Route, XCircle } from "lucide-react";
import { useHandleAuth } from "@/lib/handleAuth";
import { getScheduleRun } from "@/lib/schedules";
import { cn } from "@/lib/utils";

export function ScheduleRunScreen({ runId }: { runId: string }) {
  const { getToken, isLoaded } = useHandleAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<ScheduleRunDetail | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const loaded = await getScheduleRun({ runId, token });
        if (!cancelled) setRun(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load schedule run");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, runId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-bg-base px-8 py-8 text-[13px] text-text-secondary">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading schedule run
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen bg-bg-base px-8 py-8">
        <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">
          {error ?? "Schedule run unavailable"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-8 py-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)]">
        <section className="min-w-0">
          <a className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-primary" href="/schedules">
            <ArrowLeft className="h-3.5 w-3.5" />
            Schedules
          </a>

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] uppercase tracking-[0.04em] text-text-muted">{run.schedule.name}</p>
                <h1 className="mt-1 font-display text-[24px] font-semibold">Schedule Run</h1>
                <p className="mt-2 text-[13px] leading-5 text-text-secondary">
                  {run.outputSummary ?? run.errorMessage ?? "No summary recorded."}
                </p>
              </div>
              <StatusBadge status={run.status} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Metric label="Run mode" value={run.runMode} />
              <Metric label="Scheduled for" value={formatDate(run.scheduledFor)} />
              <Metric label="Cost" value={run.costUsd ? `$${run.costUsd}` : "Not reported"} />
            </div>
          </section>

          <section className="mt-5 rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Route className="h-4 w-4" /> Trace</h2>
            <div className="mt-4 grid gap-3">
              {run.trace.length > 0 ? run.trace.map((event, index) => (
                <TraceCard event={event} index={index} key={index} />
              )) : (
                <p className="text-[12.5px] text-text-tertiary">No trace events recorded.</p>
              )}
            </div>
          </section>

          <section className="mt-5 rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><HeartPulse className="h-4 w-4" /> Health Checks</h2>
            <JsonPanel empty="No integration health checks were required." value={run.healthChecks} />
          </section>
        </section>

        <aside className="grid h-fit gap-5">
          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><FileText className="h-4 w-4" /> Schedule</h2>
            <div className="mt-3 grid gap-2 text-[12.5px] text-text-secondary">
              <p><span className="text-text-tertiary">Target:</span> {run.schedule.targetType.toLowerCase()}</p>
              <p><span className="text-text-tertiary">Cadence:</span> {run.schedule.cronExpression ?? run.schedule.runAt ?? "manual"}</p>
              <p><span className="text-text-tertiary">Timezone:</span> {run.schedule.timezone}</p>
              <p><span className="text-text-tertiary">Overlap:</span> {run.schedule.overlapPolicy.toLowerCase()}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {run.skillRunId ? <RunLink href={`/skill-runs/${run.skillRunId}`} label="Open Skill run artifact" /> : null}
              {run.agentRunId ? <RunLink href={`/tasks/${run.agentRunId}`} label="Open task run" /> : null}
            </div>
          </section>

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Box className="h-4 w-4" /> Artifacts</h2>
            <JsonPanel empty="No artifacts recorded." value={run.artifacts} />
          </section>

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold"><ExternalLink className="h-4 w-4" /> Sources</h2>
            {run.sources.length > 0 ? <SourceList sources={run.sources} /> : <p className="mt-3 text-[12.5px] text-text-tertiary">No sources recorded.</p>}
          </section>

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Policies and Input</h2>
            <JsonPanel value={{
              approvalState: run.approvalState,
              input: run.input,
              quotaSnapshot: run.quotaSnapshot,
              targetRef: run.schedule.targetRef,
            }} />
          </section>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2">
      <p className="text-[11px] text-text-tertiary">{label}</p>
      <p className="mt-1 truncate text-[12.5px] font-medium text-text-primary">{value}</p>
    </div>
  );
}

function RunLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition hover:border-accent hover:text-text-primary" href={href}>
      {label}
    </a>
  );
}

function TraceCard({ event, index }: { event: unknown; index: number }) {
  const record = asRecord(event);
  const title = typeof record.title === "string" ? record.title : `Trace event ${index + 1}`;
  const type = typeof record.type === "string" ? record.type : "event";
  const status = typeof record.status === "string" ? record.status : null;
  return (
    <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-text-primary">{index + 1}. {title}</div>
          {status ? <div className="mt-1 text-[12px] text-text-secondary">{status}</div> : null}
        </div>
        <span className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-tertiary">{type.toLowerCase()}</span>
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: unknown[] }) {
  return (
    <div className="mt-3 grid max-h-[360px] gap-2 overflow-auto">
      {sources.map((source, index) => {
        const record = asRecord(source);
        const title = stringField(record, "title") ?? `Source ${index + 1}`;
        const url = stringField(record, "url");
        const href = citationHref(url);
        const domain = stringField(record, "domain");
        const publishedAt = stringField(record, "publishedAt");
        const accessedAt = stringField(record, "accessedAt");
        const sourceId = stringField(record, "sourceId");
        return (
          <div className="rounded-[8px] border border-border-subtle bg-bg-base px-2.5 py-2 text-[12px]" key={`${url ?? title}-${index}`}>
            {href ? (
              <a className="inline-flex items-center gap-1.5 font-medium text-text-primary hover:text-accent" href={href} rel="noreferrer" target="_blank">
                {sourceId ? `${sourceId}: ` : null}{title}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <div className="font-medium text-text-primary">{sourceId ? `${sourceId}: ` : null}{title}</div>
            )}
            <div className="mt-1 text-[11px] leading-4 text-text-tertiary">
              {[domain, publishedAt ? `published ${publishedAt}` : null, accessedAt ? `accessed ${accessedAt}` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JsonPanel({ empty, value }: { empty?: string; value: unknown }) {
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  if (isEmptyArray && empty) {
    return <p className="mt-3 text-[12.5px] text-text-tertiary">{empty}</p>;
  }
  return (
    <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[11.5px] leading-5 text-text-secondary">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StatusBadge({ status }: { status: ScheduleRunDetail["status"] }) {
  const ok = status === "COMPLETED" || status === "TEST_PASSED";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium", ok ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error")}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status.toLowerCase()}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function citationHref(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) return `https://${value}`;
  return value;
}
