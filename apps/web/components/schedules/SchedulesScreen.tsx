"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ParsedSchedulePreview, ScheduleRunSummary, ScheduleSummary, ScheduleTargetType, ScheduleTemplateSummary } from "@handle/shared";
import { CalendarClock, CheckCircle2, FlaskConical, History, Play, Plus, RefreshCcw, ShieldAlert, Wand2, XCircle } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import {
  backfillSchedule,
  createSchedule,
  listScheduleTemplates,
  listSchedules,
  parseScheduleText,
  runScheduleNow,
  updateSchedule,
} from "@/lib/schedules";
import { cn } from "@/lib/utils";

type TargetChoice = "TASK" | "SKILL" | "WIDE_RESEARCH" | "SKILL_WORKFLOW";

const fieldClass =
  "w-full rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent";

export function SchedulesScreen() {
  const { getToken, isLoaded } = useHandleAuth();
  const [backfillFrom, setBackfillFrom] = useState("");
  const [backfillTo, setBackfillTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => defaultDraft());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ParsedSchedulePreview | null>(null);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplateSummary[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const selected = schedules.find((schedule) => schedule.id === selectedId) ?? schedules[0] ?? null;

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextToken = await getToken();
        setToken(nextToken);
        const [loadedSchedules, loadedTemplates] = await Promise.all([
          listSchedules({ token: nextToken }),
          listScheduleTemplates({ token: nextToken }),
        ]);
        if (!cancelled) {
          setSchedules(loadedSchedules);
          setTemplates(loadedTemplates);
          setSelectedId((current) => current ?? loadedSchedules[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load schedules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  const nextRuns = useMemo(() => {
    if (preview?.nextRuns?.length) return preview.nextRuns;
    return selected?.nextRunAt ? [selected.nextRunAt] : [];
  }, [preview, selected]);

  async function handleParse() {
    if (!draft.naturalLanguage.trim()) return;
    setBusy("parse");
    setError(null);
    try {
      const parsed = await parseScheduleText({
        text: draft.naturalLanguage,
        timezone: draft.timezone,
        token,
      });
      setPreview(parsed);
      setDraft((current) => ({
        ...current,
        cronExpression: parsed.cronExpression ?? current.cronExpression,
        runAt: parsed.runAt ?? current.runAt,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate() {
    setBusy("create");
    setError(null);
    try {
      const schedule = await createSchedule({
        input: buildCreateRequest(draft),
        token,
      });
      setSchedules((current) => [schedule, ...current]);
      setSelectedId(schedule.id);
      setDraft(defaultDraft());
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleRun(schedule: ScheduleSummary, mode: "normal" | "test") {
    setBusy(`${mode}:${schedule.id}`);
    setError(null);
    try {
      const run = await runScheduleNow({ mode, scheduleId: schedule.id, token });
      setSchedules((current) => current.map((item) => (
        item.id === schedule.id
          ? { ...item, lastRun: run, lastRunAt: run.completedAt ?? new Date().toISOString() }
          : item
      )));
      setSelectedId(schedule.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(schedule: ScheduleSummary) {
    setBusy(`toggle:${schedule.id}`);
    setError(null);
    try {
      const updated = await updateSchedule({
        input: { enabled: !schedule.enabled, status: schedule.enabled ? "PAUSED" : "ACTIVE" },
        scheduleId: schedule.id,
        token,
      });
      setSchedules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleBackfill(schedule: ScheduleSummary) {
    if (!backfillFrom || !backfillTo) return;
    setBusy(`backfill:${schedule.id}`);
    setError(null);
    try {
      const runs = await backfillSchedule({
        from: backfillFrom,
        maxRuns: 3,
        scheduleId: schedule.id,
        to: backfillTo,
        token,
      });
      const last = runs.at(-1);
      if (last) {
        setSchedules((current) => current.map((item) => (
          item.id === schedule.id ? { ...item, lastRun: last, lastRunAt: last.completedAt ?? null } : item
        )));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not backfill schedule");
    } finally {
      setBusy(null);
    }
  }

  function applyTemplate(template: ScheduleTemplateSummary) {
    const scheduleDefaults = template.scheduleDefaults;
    setDraft({
      cronExpression: typeof scheduleDefaults.cronExpression === "string" ? scheduleDefaults.cronExpression : "",
      enabled: false,
      inputJson: JSON.stringify(template.inputDefaults, null, 2),
      name: template.name,
      naturalLanguage: "",
      runAt: "",
      targetRefJson: JSON.stringify(template.targetRef, null, 2),
      targetType: template.targetType,
      timezone: typeof scheduleDefaults.timezone === "string" ? scheduleDefaults.timezone : "America/Chicago",
    });
    setPreview(null);
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-8 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-subtle bg-bg-canvas text-accent">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-[28px] font-semibold">Schedules</h1>
              <p className="mt-1 text-[12px] text-text-secondary">
                Durable Temporal-backed runs for tasks, Skills, workflows, and Wide Research.
              </p>
            </div>
          </div>
          <PillButton className="gap-2" onClick={handleCreate} disabled={busy === "create"} variant="primary">
            <Plus className="h-4 w-4" />
            Create Schedule
          </PillButton>
        </header>

        {error ? (
          <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4">
            <ScheduleBuilder
              busy={busy}
              draft={draft}
              onChange={setDraft}
              onParse={handleParse}
              preview={preview}
            />
            <TemplateGrid onSelect={applyTemplate} templates={templates} />
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
              <h2 className="text-[15px] font-semibold">Next Runs</h2>
              <div className="mt-3 grid gap-2">
                {nextRuns.length > 0 ? nextRuns.map((run) => (
                  <div className="rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-secondary" key={run}>
                    {formatDate(run)}
                  </div>
                )) : (
                  <p className="text-[12px] text-text-muted">Parse or select a schedule to preview the next runs.</p>
                )}
              </div>
            </section>
            <ScheduleDetail
              backfillFrom={backfillFrom}
              backfillTo={backfillTo}
              busy={busy}
              onBackfill={handleBackfill}
              onRun={handleRun}
              onSelectDate={(field, value) => field === "from" ? setBackfillFrom(value) : setBackfillTo(value)}
              onToggle={handleToggle}
              schedule={selected}
            />
          </aside>
        </section>

        <section className="rounded-[8px] border border-border-subtle bg-bg-canvas">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <h2 className="text-[15px] font-semibold">Schedule Library</h2>
              <p className="mt-1 text-[12px] text-text-secondary">Unified schedule records with current state and latest run result.</p>
            </div>
            <RefreshCcw className={cn("h-4 w-4 text-text-muted", loading && "animate-spin")} />
          </div>
          <div className="divide-y divide-border-subtle">
            {schedules.length === 0 ? (
              <div className="px-4 py-8 text-[13px] text-text-secondary">No schedules yet. Create one from natural language or a template.</div>
            ) : schedules.map((schedule) => (
              <button
                className={cn(
                  "grid w-full gap-2 px-4 py-3 text-left transition hover:bg-bg-subtle",
                  selected?.id === schedule.id && "bg-bg-subtle",
                )}
                key={schedule.id}
                onClick={() => setSelectedId(schedule.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={schedule.status} />
                      <span className="truncate text-[13px] font-medium">{schedule.name}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-text-secondary">{schedule.targetType.toLowerCase()} · {schedule.cronExpression ?? schedule.runAt ?? "manual"}</p>
                  </div>
                  <span className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary">
                    {schedule.status.toLowerCase()}
                  </span>
                </div>
                {schedule.lastRun ? (
                  <p className="text-[12px] text-text-tertiary">
                    Last run: {schedule.lastRun.status.toLowerCase()} · {schedule.lastRun.outputSummary ?? schedule.lastRun.errorMessage ?? "No summary"}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ScheduleBuilder({
  busy,
  draft,
  onChange,
  onParse,
  preview,
}: {
  busy: string | null;
  draft: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  onParse: () => void;
  preview: ParsedSchedulePreview | null;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Create Schedule</h2>
          <p className="mt-1 text-[12px] text-text-secondary">Use natural language, then inspect the concrete target before saving.</p>
        </div>
        <PillButton className="gap-2" onClick={onParse} disabled={busy === "parse" || !draft.naturalLanguage.trim()} variant="secondary">
          <Wand2 className="h-4 w-4" />
          Parse
        </PillButton>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input className={fieldClass} onChange={(event) => set({ name: event.target.value })} value={draft.name} />
        </Field>
        <Field label="Target type">
          <select className={fieldClass} onChange={(event) => set({ targetType: event.target.value as TargetChoice })} value={draft.targetType}>
            <option value="TASK">Task</option>
            <option value="SKILL">Skill</option>
            <option value="WIDE_RESEARCH">Wide Research</option>
            <option value="SKILL_WORKFLOW">Skill Workflow</option>
          </select>
        </Field>
        <Field className="md:col-span-2" label="Natural language schedule">
          <input
            className={fieldClass}
            onChange={(event) => set({ naturalLanguage: event.target.value })}
            placeholder="every weekday at 9am"
            value={draft.naturalLanguage}
          />
        </Field>
        <Field label="Cron expression">
          <input className={fieldClass} onChange={(event) => set({ cronExpression: event.target.value })} placeholder="0 9 * * 1-5" value={draft.cronExpression} />
        </Field>
        <Field label="One-time run">
          <input className={fieldClass} onChange={(event) => set({ runAt: event.target.value })} type="datetime-local" value={draft.runAt} />
        </Field>
        <Field label="Timezone">
          <input className={fieldClass} onChange={(event) => set({ timezone: event.target.value })} value={draft.timezone} />
        </Field>
        <Field label="State">
          <select className={fieldClass} onChange={(event) => set({ enabled: event.target.value === "true" })} value={String(draft.enabled)}>
            <option value="false">Paused after create</option>
            <option value="true">Enabled after create</option>
          </select>
        </Field>
        <Field className="md:col-span-2" label="Target reference JSON">
          <textarea className={`${fieldClass} min-h-[96px] font-mono`} onChange={(event) => set({ targetRefJson: event.target.value })} value={draft.targetRefJson} />
        </Field>
        <Field className="md:col-span-2" label="Input JSON">
          <textarea className={`${fieldClass} min-h-[96px] font-mono`} onChange={(event) => set({ inputJson: event.target.value })} value={draft.inputJson} />
        </Field>
      </div>

      {preview ? (
        <div className="mt-4 rounded-[8px] border border-status-success/20 bg-status-success/5 px-3 py-2 text-[12px] text-text-secondary">
          <span className="font-medium text-status-success">Parsed:</span> {preview.explanation} · confidence {Math.round(preview.confidence * 100)}%
        </div>
      ) : null}
    </section>
  );
}

function TemplateGrid({ onSelect, templates }: { onSelect: (template: ScheduleTemplateSummary) => void; templates: ScheduleTemplateSummary[] }) {
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
      <h2 className="text-[15px] font-semibold">Built-in Templates</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {templates.map((template) => (
          <button className="rounded-[8px] border border-border-subtle bg-bg-base p-3 text-left transition hover:border-accent" key={template.slug} onClick={() => onSelect(template)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium">{template.name}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-text-secondary">{template.description}</p>
              </div>
              <span className="rounded-pill border border-border-subtle px-2 py-1 text-[10.5px] text-text-tertiary">{template.category}</span>
            </div>
            {template.requiredConnectors.length > 0 ? (
              <p className="mt-2 text-[11px] text-text-muted">Requires {template.requiredConnectors.join(", ")}</p>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function ScheduleDetail({
  backfillFrom,
  backfillTo,
  busy,
  onBackfill,
  onRun,
  onSelectDate,
  onToggle,
  schedule,
}: {
  backfillFrom: string;
  backfillTo: string;
  busy: string | null;
  onBackfill: (schedule: ScheduleSummary) => void;
  onRun: (schedule: ScheduleSummary, mode: "normal" | "test") => void;
  onSelectDate: (field: "from" | "to", value: string) => void;
  onToggle: (schedule: ScheduleSummary) => void;
  schedule: ScheduleSummary | null;
}) {
  if (!schedule) {
    return (
      <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4 text-[13px] text-text-secondary">
        Select a schedule to see controls and run history.
      </section>
    );
  }
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{schedule.name}</h2>
          <p className="mt-1 text-[12px] text-text-secondary">{schedule.targetType} · {schedule.timezone}</p>
        </div>
        <StatusIcon status={schedule.status} />
      </div>
      <div className="mt-4 grid gap-2">
        <PillButton className="w-full justify-center gap-2" onClick={() => onRun(schedule, "normal")} disabled={busy === `normal:${schedule.id}`} variant="primary">
          <Play className="h-4 w-4" />
          Run Now
        </PillButton>
        <PillButton className="w-full justify-center gap-2" onClick={() => onRun(schedule, "test")} disabled={busy === `test:${schedule.id}`} variant="secondary">
          <FlaskConical className="h-4 w-4" />
          Test Run
        </PillButton>
        <PillButton className="w-full justify-center" onClick={() => onToggle(schedule)} disabled={busy === `toggle:${schedule.id}`} variant="secondary">
          {schedule.enabled ? "Pause Schedule" : "Enable Schedule"}
        </PillButton>
      </div>
      <div className="mt-4 grid gap-2 rounded-[8px] border border-border-subtle bg-bg-base p-3">
        <p className="text-[12px] font-medium">Backfill</p>
        <input className={fieldClass} onChange={(event) => onSelectDate("from", event.target.value)} type="date" value={backfillFrom} />
        <input className={fieldClass} onChange={(event) => onSelectDate("to", event.target.value)} type="date" value={backfillTo} />
        <PillButton className="justify-center" onClick={() => onBackfill(schedule)} disabled={!backfillFrom || !backfillTo || busy === `backfill:${schedule.id}`} variant="secondary">
          Run Backfill
        </PillButton>
      </div>
      <RunCard run={schedule.lastRun ?? null} />
    </section>
  );
}

function RunCard({ run }: { run: ScheduleRunSummary | null }) {
  if (!run) {
    return <p className="mt-4 text-[12px] text-text-muted">No runs recorded yet.</p>;
  }
  return (
    <div className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-text-muted" />
        <p className="text-[12px] font-medium">Latest run</p>
        <span className="ml-auto rounded-pill border border-border-subtle px-2 py-1 text-[10.5px] text-text-secondary">{run.status.toLowerCase()}</span>
      </div>
      <p className="mt-2 text-[12px] text-text-secondary">{run.outputSummary ?? run.errorMessage ?? "No output summary."}</p>
      {run.healthChecks.length > 0 ? (
        <div className="mt-3 grid gap-1">
          {run.healthChecks.map((check, index) => (
            <p className="text-[11px] text-text-muted" key={index}>{JSON.stringify(check)}</p>
          ))}
        </div>
      ) : null}
      {run.artifacts.length > 0 ? (
        <p className="mt-2 text-[11px] text-text-muted">{run.artifacts.length} artifact(s) linked.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition hover:border-accent hover:text-text-primary"
          href={`/schedule-runs/${run.id}`}
        >
          Open schedule run
        </a>
        {run.skillRunId ? (
          <a
            className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition hover:border-accent hover:text-text-primary"
            href={`/skill-runs/${run.skillRunId}`}
          >
            Open Skill run artifact
          </a>
        ) : null}
        {run.agentRunId ? (
          <a
            className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition hover:border-accent hover:text-text-primary"
            href={`/tasks/${run.agentRunId}`}
          >
            Open task run
          </a>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ACTIVE" || status === "COMPLETED" || status === "TEST_PASSED") {
    return <CheckCircle2 className="h-4 w-4 text-status-success" />;
  }
  if (status === "ERROR" || status === "FAILED") {
    return <XCircle className="h-4 w-4 text-status-error" />;
  }
  if (status === "WAITING_FOR_APPROVAL" || status === "WAITING_FOR_INTEGRATION") {
    return <ShieldAlert className="h-4 w-4 text-status-warning" />;
  }
  return <CalendarClock className="h-4 w-4 text-text-muted" />;
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={cn("grid gap-1 text-[12px] text-text-secondary", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function defaultDraft(): ScheduleDraft {
  return {
    cronExpression: "",
    enabled: false,
    inputJson: "{\n  \"company\": \"Anthropic\",\n  \"depth\": \"standard\"\n}",
    name: "Research Anthropic every weekday",
    naturalLanguage: "every weekday at 9am",
    runAt: "",
    targetRefJson: "{\n  \"skillSlug\": \"research-company\"\n}",
    targetType: "WIDE_RESEARCH",
    timezone: "America/Chicago",
  };
}

function buildCreateRequest(draft: ScheduleDraft) {
  const targetRef = JSON.parse(draft.targetRefJson || "{}") as Record<string, unknown>;
  const input = JSON.parse(draft.inputJson || "{}") as Record<string, unknown>;
  return stripUndefined({
    cronExpression: draft.cronExpression || null,
    enabled: draft.enabled,
    input,
    name: draft.name,
    naturalLanguage: draft.naturalLanguage || undefined,
    runAt: draft.runAt ? new Date(draft.runAt).toISOString() : null,
    targetRef,
    targetType: draft.targetType as ScheduleTargetType,
    timezone: draft.timezone,
  }) as Parameters<typeof createSchedule>[0]["input"];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface ScheduleDraft {
  cronExpression: string;
  enabled: boolean;
  inputJson: string;
  name: string;
  naturalLanguage: string;
  runAt: string;
  targetRefJson: string;
  targetType: TargetChoice;
  timezone: string;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
