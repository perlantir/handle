"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ParsedSchedulePreview,
  ScheduleRunSummary,
  ScheduleSummary,
  ScheduleTargetType,
  ScheduleTemplateSummary,
} from "@handle/shared";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FlaskConical,
  History,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { PillButton } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import {
  backfillSchedule,
  createSchedule,
  deleteSchedule,
  listScheduleTemplates,
  listSchedules,
  parseScheduleText,
  runScheduleNow,
  updateSchedule,
} from "@/lib/schedules";
import { cn } from "@/lib/utils";

type TargetChoice = "TASK" | "SKILL" | "WIDE_RESEARCH" | "SKILL_WORKFLOW";
type Frequency = "once" | "hourly" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
type OutputChannel = "IN_APP" | "EMAIL" | "SLACK" | "WEBHOOK";

const fieldClass =
  "w-full rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent";

const skillOptions = [
  { label: "Research a Company", value: "research-company" },
  { label: "Email Outreach", value: "email-outreach" },
  { label: "Plan a Trip", value: "plan-a-trip" },
  { label: "Code Review a PR", value: "code-review-a-pr" },
  { label: "Summarize a Notion Workspace", value: "summarize-a-notion-workspace" },
];

export function SchedulesScreen({ surface = "schedules" }: { surface?: "automations" | "schedules" }) {
  const isAutomations = surface === "automations";
  const { getToken, isLoaded } = useHandleAuth();
  const [backfillFrom, setBackfillFrom] = useState("");
  const [backfillTo, setBackfillTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => blankDraft());
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ParsedSchedulePreview | null>(null);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplateSummary[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const selected = schedules.find((schedule) => schedule.id === selectedId) ?? schedules[0] ?? null;
  const previewRuns = useMemo(() => nextRunsForDraft(draft, preview), [draft, preview]);

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

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function updateDraft(patch: Partial<ScheduleDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function startCreate() {
    if (dirty && !window.confirm("Discard unsaved schedule changes?")) return;
    setDraft(blankDraft());
    setEditingId(null);
    setPreview(null);
    setDirty(false);
    setSelectedId(null);
    setError(null);
  }

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
      setDraft((current) => draftFromParsed(current, parsed));
      setDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave(enabled: boolean) {
    setBusy(editingId ? `save:${editingId}` : "create");
    setError(null);
    try {
      const input = buildCreateRequest({ ...draft, enabled });
      const duplicate = schedules.find(
        (schedule) => schedule.id !== editingId && schedule.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      );
      if (duplicate && !window.confirm(`A schedule named "${duplicate.name}" already exists. Update that existing schedule instead?`)) {
        setBusy(null);
        return;
      }
      const schedule = duplicate
        ? await updateSchedule({ input, scheduleId: duplicate.id, token })
        : editingId
          ? await updateSchedule({ input, scheduleId: editingId, token })
          : await createSchedule({ input, token });
      setSchedules((current) => {
        const without = current.filter((item) => item.id !== schedule.id);
        return [schedule, ...without];
      });
      setSelectedId(schedule.id);
      setEditingId(null);
      setDraft(blankDraft());
      setPreview(null);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule");
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

  function handleEdit(schedule: ScheduleSummary) {
    if (dirty && !window.confirm("Discard unsaved schedule changes?")) return;
    setDraft(draftFromSchedule(schedule));
    setEditingId(schedule.id);
    setPreview(null);
    setDirty(false);
    setSelectedId(schedule.id);
  }

  async function handleDelete(schedule: ScheduleSummary) {
    if (!window.confirm(`Delete schedule "${schedule.name}"? This cannot be undone.`)) return;
    setBusy(`delete:${schedule.id}`);
    setError(null);
    try {
      await deleteSchedule({ scheduleId: schedule.id, token });
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      setSelectedId((current) => (current === schedule.id ? null : current));
      if (editingId === schedule.id) startCreate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete schedule");
    } finally {
      setBusy(null);
    }
  }

  async function handleCleanup() {
    const removable = schedules.filter((schedule) => !schedule.enabled || /test/i.test(schedule.name));
    if (removable.length === 0) {
      setError("No paused or test-only schedules to clean up.");
      return;
    }
    if (!window.confirm(`Delete ${removable.length} paused or test-only schedule(s)? This cannot be undone.`)) return;
    setBusy("cleanup");
    setError(null);
    try {
      for (const schedule of removable) {
        await deleteSchedule({ scheduleId: schedule.id, token });
      }
      const removed = new Set(removable.map((schedule) => schedule.id));
      setSchedules((current) => current.filter((schedule) => !removed.has(schedule.id)));
      setSelectedId((current) => (current && removed.has(current) ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clean up schedules");
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
    if (dirty && !window.confirm("Discard unsaved schedule changes?")) return;
    const scheduleDefaults = template.scheduleDefaults;
    const cronExpression = typeof scheduleDefaults.cronExpression === "string" ? scheduleDefaults.cronExpression : "";
    setDraft(draftFromRecords({
      cronExpression,
      enabled: false,
      input: template.inputDefaults,
      name: template.name,
      naturalLanguage: "",
      runAt: "",
      targetRef: template.targetRef,
      targetType: template.targetType,
      timezone: typeof scheduleDefaults.timezone === "string" ? scheduleDefaults.timezone : "America/Chicago",
    }));
    setEditingId(null);
    setPreview(null);
    setDirty(true);
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
              <h1 className="font-display text-[28px] font-semibold">{isAutomations ? "Automations" : "Schedules"}</h1>
              <p className="mt-1 text-[12px] text-text-secondary">
                {isAutomations
                  ? "Tell Handle what to do and when. Automations run in the background and can email, post, or save the result."
                  : "Durable Temporal-backed runs for tasks, Skills, workflows, and Wide Research."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton className="gap-2" onClick={handleCleanup} disabled={busy === "cleanup"} variant="secondary">
              <Trash2 className="h-4 w-4" />
              Clean up paused/test
            </PillButton>
            <PillButton className="gap-2" onClick={startCreate} variant="primary">
              <Plus className="h-4 w-4" />
              {isAutomations ? "Create Automation" : "Create Schedule"}
            </PillButton>
          </div>
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
              editing={Boolean(editingId)}
              surface={surface}
              onChange={updateDraft}
              onParse={handleParse}
              onSave={handleSave}
              preview={preview}
              previewRuns={previewRuns}
            />
            <TemplateGrid onSelect={applyTemplate} surface={surface} templates={templates} />
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
              <h2 className="text-[15px] font-semibold">Preview</h2>
              <div className="mt-3 grid gap-2 text-[12px] text-text-secondary">
                <PreviewRow label="Name" value={draft.name || "Untitled schedule"} />
                <PreviewRow label="What it does" value={humanTarget(draft)} />
                <PreviewRow label="When" value={humanWhen(draft)} />
                <PreviewRow label="Output" value={humanOutput(draft.outputChannel)} />
              </div>
              <div className="mt-4">
                <p className="text-[12px] font-medium">Next 3 runs</p>
                <div className="mt-2 grid gap-2">
                  {previewRuns.length > 0 ? previewRuns.slice(0, 3).map((run) => (
                    <div className="rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-secondary" key={run}>
                      {formatDate(run)}
                    </div>
                  )) : (
                    <p className="text-[12px] text-text-muted">Parse or complete the schedule fields to preview run times.</p>
                  )}
                </div>
              </div>
            </section>
            <ScheduleDetail
              backfillFrom={backfillFrom}
              backfillTo={backfillTo}
              busy={busy}
              onBackfill={handleBackfill}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onRun={handleRun}
              onSelectDate={(field, value) => field === "from" ? setBackfillFrom(value) : setBackfillTo(value)}
              onToggle={handleToggle}
              schedule={selected}
            />
          </aside>
        </section>

        <ScheduleLibrary
          busy={busy}
          loading={loading}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onRun={handleRun}
          onSelect={setSelectedId}
          onToggle={handleToggle}
          surface={surface}
          schedules={schedules}
          selectedId={selected?.id ?? null}
        />
      </div>
    </main>
  );
}

function ScheduleBuilder({
  busy,
  draft,
  editing,
  surface,
  onChange,
  onParse,
  onSave,
  preview,
  previewRuns,
}: {
  busy: string | null;
  draft: ScheduleDraft;
  editing: boolean;
  surface: "automations" | "schedules";
  onChange: (patch: Partial<ScheduleDraft>) => void;
  onParse: () => void;
  onSave: (enabled: boolean) => void;
  preview: ParsedSchedulePreview | null;
  previewRuns: string[];
}) {
  const isAutomations = surface === "automations";
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">
            {editing ? (isAutomations ? "Edit Automation" : "Edit Schedule") : (isAutomations ? "New Automation" : "New Schedule")}
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            {isAutomations
              ? "Describe the outcome in plain English. Handle fills in the timing, task, and delivery method."
              : "Describe the automation. Handle fills the schedule, target, inputs, and output."}
          </p>
        </div>
        <PillButton className="gap-2" onClick={onParse} disabled={busy === "parse" || !draft.naturalLanguage.trim()} variant="secondary">
          <Wand2 className="h-4 w-4" />
          Parse and preview
        </PillButton>
      </div>

      <Field className="mt-4" label={isAutomations ? "What should Handle do, and when?" : "Describe what you want to schedule"}>
        <textarea
          className={`${fieldClass} min-h-[104px] resize-y text-[14px]`}
          onChange={(event) => onChange({ naturalLanguage: event.target.value })}
          placeholder={isAutomations ? "Every day at 9am, email me the top 5 AI news stories" : "Every weekday at 9am, research OpenAI and email me the report"}
          value={draft.naturalLanguage}
        />
      </Field>

      {preview ? (
        <div className="mt-4 rounded-[8px] border border-status-success/20 bg-status-success/5 px-3 py-2 text-[12px] text-text-secondary">
          <span className="font-medium text-status-success">Parsed:</span> {preview.explanation} · confidence {Math.round(preview.confidence * 100)}%
        </div>
      ) : null}

      <div className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-4">
        <div className="grid gap-3 text-[13px]">
          <PreviewRow label="Name" value={draft.name || "Untitled schedule"} />
          <PreviewRow label="What it does" value={humanTarget(draft)} />
          <PreviewRow label="When" value={humanWhen(draft)} />
          <PreviewRow label="Output" value={humanOutput(draft.outputChannel)} />
        </div>
        <div className="mt-4">
          <p className="text-[12px] font-medium">Next 3 runs</p>
          <div className="mt-2 grid gap-2">
            {previewRuns.length > 0 ? previewRuns.slice(0, 3).map((run) => (
              <div className="rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-2 text-[12px] text-text-secondary" key={run}>
                {formatDate(run)}
              </div>
            )) : (
              <p className="text-[12px] text-text-muted">Use Parse and preview to calculate upcoming run times.</p>
            )}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-3" open={draft.detailsOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium">
          Edit details
          <ChevronDown className="h-4 w-4 text-text-muted" />
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className={fieldClass} onChange={(event) => onChange({ name: event.target.value })} value={draft.name} />
          </Field>
          <Field label="Target">
            <select
              className={fieldClass}
              onChange={(event) => {
                const targetType = event.target.value as TargetChoice;
                onChange({
                  targetType,
                  targetSkillSlug: targetType === "TASK" ? "" : draft.targetSkillSlug || "research-company",
                });
              }}
              value={draft.targetType}
            >
              <option value="TASK">Task</option>
              <option value="SKILL">Skill</option>
              <option value="WIDE_RESEARCH">Wide Research Skill</option>
              <option value="SKILL_WORKFLOW">Skill Workflow</option>
            </select>
          </Field>
          {draft.targetType === "TASK" ? (
            <Field className="md:col-span-2" label="Task goal">
              <textarea className={`${fieldClass} min-h-[80px]`} onChange={(event) => onChange({ goal: event.target.value })} value={draft.goal} />
            </Field>
          ) : (
            <Field label="Skill">
              <select className={fieldClass} onChange={(event) => onChange({ targetSkillSlug: event.target.value })} value={draft.targetSkillSlug}>
                {skillOptions.map((skill) => <option key={skill.value} value={skill.value}>{skill.label}</option>)}
              </select>
            </Field>
          )}
          {draft.targetSkillSlug === "research-company" || draft.targetType === "WIDE_RESEARCH" ? (
            <>
              <Field label="Company">
                <input className={fieldClass} onChange={(event) => onChange({ company: event.target.value })} value={draft.company} />
              </Field>
              <Field label="Depth">
                <select className={fieldClass} onChange={(event) => onChange({ depth: event.target.value })} value={draft.depth}>
                  <option value="quick">Quick</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
              </Field>
            </>
          ) : null}
          <FrequencyBuilder draft={draft} onChange={onChange} />
          <Field label="Timezone">
            <input className={fieldClass} onChange={(event) => onChange({ timezone: event.target.value })} value={draft.timezone} />
          </Field>
          <Field label="Output">
            <select className={fieldClass} onChange={(event) => onChange({ outputChannel: event.target.value as OutputChannel })} value={draft.outputChannel}>
              <option value="IN_APP">Handle schedule history</option>
              <option value="EMAIL">Email via Settings notifications</option>
              <option value="SLACK">Slack via Settings notifications</option>
              <option value="WEBHOOK">Webhook via Settings notifications</option>
            </select>
          </Field>
        </div>
      </details>

      <details className="mt-3 rounded-[8px] border border-border-subtle bg-bg-base p-3">
        <summary className="cursor-pointer list-none text-[12px] font-medium text-text-secondary">Advanced JSON fallback</summary>
        <div className="mt-3 grid gap-3">
          <Field label="Target reference JSON">
            <textarea className={`${fieldClass} min-h-[96px] font-mono`} onChange={(event) => onChange({ advancedEdited: true, targetRefJson: event.target.value })} value={draft.targetRefJson} />
          </Field>
          <Field label="Input JSON">
            <textarea className={`${fieldClass} min-h-[96px] font-mono`} onChange={(event) => onChange({ advancedEdited: true, inputJson: event.target.value })} value={draft.inputJson} />
          </Field>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <PillButton className="gap-2" disabled={busy === "create" || busy?.startsWith("save:")} onClick={() => onSave(true)} variant="primary">
          <CheckCircle2 className="h-4 w-4" />
          Save & Activate
        </PillButton>
        <PillButton disabled={busy === "create" || busy?.startsWith("save:")} onClick={() => onSave(false)} variant="secondary">
          Save & Pause
        </PillButton>
      </div>
    </section>
  );
}

function FrequencyBuilder({ draft, onChange }: { draft: ScheduleDraft; onChange: (patch: Partial<ScheduleDraft>) => void }) {
  return (
    <>
      <Field label="Frequency">
        <select
          className={fieldClass}
          onChange={(event) => {
            const frequency = event.target.value as Frequency;
            onChange({ frequency, ...schedulePatchForFrequency({ ...draft, frequency }) });
          }}
          value={draft.frequency}
        >
          <option value="once">Once</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays only</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom cron</option>
        </select>
      </Field>
      {draft.frequency === "once" ? (
        <Field label="Run at">
          <input className={fieldClass} onChange={(event) => onChange({ runAt: event.target.value, cronExpression: "" })} type="datetime-local" value={draft.runAt} />
        </Field>
      ) : null}
      {["daily", "weekdays", "weekly", "monthly"].includes(draft.frequency) ? (
        <Field label="Time">
          <input
            className={fieldClass}
            onChange={(event) => {
              const time = event.target.value;
              onChange({ time, ...schedulePatchForFrequency({ ...draft, time }) });
            }}
            type="time"
            value={draft.time}
          />
        </Field>
      ) : null}
      {draft.frequency === "weekly" ? (
        <Field label="Day">
          <select
            className={fieldClass}
            onChange={(event) => {
              const dayOfWeek = event.target.value;
              onChange({ dayOfWeek, ...schedulePatchForFrequency({ ...draft, dayOfWeek }) });
            }}
            value={draft.dayOfWeek}
          >
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option key={day} value={String(index)}>{day}</option>
            ))}
          </select>
        </Field>
      ) : null}
      {draft.frequency === "monthly" ? (
        <Field label="Day of month">
          <input
            className={fieldClass}
            max={31}
            min={1}
            onChange={(event) => {
              const dayOfMonth = event.target.value;
              onChange({ dayOfMonth, ...schedulePatchForFrequency({ ...draft, dayOfMonth }) });
            }}
            type="number"
            value={draft.dayOfMonth}
          />
        </Field>
      ) : null}
      {draft.frequency === "custom" ? (
        <Field label="Cron expression">
          <input className={fieldClass} onChange={(event) => onChange({ cronExpression: event.target.value })} placeholder="0 9 * * 1-5" value={draft.cronExpression} />
        </Field>
      ) : null}
    </>
  );
}

function TemplateGrid({
  onSelect,
  surface,
  templates,
}: {
  onSelect: (template: ScheduleTemplateSummary) => void;
  surface: "automations" | "schedules";
  templates: ScheduleTemplateSummary[];
}) {
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-4">
      <h2 className="text-[15px] font-semibold">{surface === "automations" ? "Automation Starters" : "Built-in Templates"}</h2>
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

function ScheduleLibrary({
  busy,
  loading,
  onDelete,
  onEdit,
  onRun,
  onSelect,
  onToggle,
  surface,
  schedules,
  selectedId,
}: {
  busy: string | null;
  loading: boolean;
  onDelete: (schedule: ScheduleSummary) => void;
  onEdit: (schedule: ScheduleSummary) => void;
  onRun: (schedule: ScheduleSummary, mode: "normal" | "test") => void;
  onSelect: (id: string) => void;
  onToggle: (schedule: ScheduleSummary) => void;
  surface: "automations" | "schedules";
  schedules: ScheduleSummary[];
  selectedId: string | null;
}) {
  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">{surface === "automations" ? "Automation Library" : "Schedule Library"}</h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            {surface === "automations"
              ? "Run, pause, edit, or delete any automation from one place."
              : "Inline controls are available on every saved schedule."}
          </p>
        </div>
        <RefreshCcw className={cn("h-4 w-4 text-text-muted", loading && "animate-spin")} />
      </div>
      <div className="divide-y divide-border-subtle">
        {schedules.length === 0 ? (
          <div className="px-4 py-8 text-[13px] text-text-secondary">
            {surface === "automations"
              ? "No automations yet. Create one in plain English or start from a template."
              : "No schedules yet. Create one from natural language or a template."}
          </div>
        ) : schedules.map((schedule) => (
          <div
            className={cn(
              "grid gap-3 px-4 py-3 transition hover:bg-bg-subtle",
              selectedId === schedule.id && "bg-bg-subtle",
            )}
            key={schedule.id}
          >
            <button className="text-left" onClick={() => onSelect(schedule.id)}>
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
                <p className="mt-2 text-[12px] text-text-tertiary">
                  Last run: {schedule.lastRun.status.toLowerCase()} · {schedule.lastRun.outputSummary ?? schedule.lastRun.errorMessage ?? "No summary"}
                </p>
              ) : null}
            </button>
            <div className="flex flex-wrap gap-2">
              <SmallAction busy={busy === `normal:${schedule.id}`} icon={<Play className="h-3.5 w-3.5" />} label="Run now" onClick={() => onRun(schedule, "normal")} />
              <SmallAction
                busy={busy === `toggle:${schedule.id}`}
                icon={schedule.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                label={schedule.enabled ? "Pause" : "Resume"}
                onClick={() => onToggle(schedule)}
              />
              <SmallAction busy={false} icon={<Edit3 className="h-3.5 w-3.5" />} label="Edit" onClick={() => onEdit(schedule)} />
              <SmallAction busy={busy === `delete:${schedule.id}`} icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={() => onDelete(schedule)} />
            </div>
          </div>
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
  onDelete,
  onEdit,
  onRun,
  onSelectDate,
  onToggle,
  schedule,
}: {
  backfillFrom: string;
  backfillTo: string;
  busy: string | null;
  onBackfill: (schedule: ScheduleSummary) => void;
  onDelete: (schedule: ScheduleSummary) => void;
  onEdit: (schedule: ScheduleSummary) => void;
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
        <div className="grid grid-cols-3 gap-2">
          <PillButton className="justify-center" onClick={() => onToggle(schedule)} disabled={busy === `toggle:${schedule.id}`} variant="secondary">
            {schedule.enabled ? "Pause" : "Resume"}
          </PillButton>
          <PillButton className="justify-center" onClick={() => onEdit(schedule)} variant="secondary">
            Edit
          </PillButton>
          <PillButton className="justify-center" onClick={() => onDelete(schedule)} disabled={busy === `delete:${schedule.id}`} variant="secondary">
            Delete
          </PillButton>
        </div>
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

function SmallAction({ busy, icon, label, onClick }: { busy: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-pill border border-border-subtle px-2.5 py-1 text-[11.5px] text-text-secondary transition hover:border-accent hover:text-text-primary disabled:opacity-50"
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
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

function PreviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.04em] text-text-muted">{label}</span>
      <span className="text-[13px] text-text-primary">{value}</span>
    </div>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={cn("grid gap-1 text-[12px] text-text-secondary", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function blankDraft(): ScheduleDraft {
  return {
    advancedEdited: false,
    company: "",
    cronExpression: "",
    dayOfMonth: "1",
    dayOfWeek: "1",
    depth: "standard",
    detailsOpen: false,
    enabled: false,
    frequency: "weekdays",
    goal: "",
    inputJson: "{}",
    name: "",
    naturalLanguage: "",
    outputChannel: "IN_APP",
    runAt: "",
    targetRefJson: "{\n  \"skillSlug\": \"research-company\"\n}",
    targetSkillSlug: "research-company",
    targetType: "WIDE_RESEARCH",
    time: "09:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
  };
}

function draftFromParsed(current: ScheduleDraft, parsed: ParsedSchedulePreview): ScheduleDraft {
  return draftFromRecords({
    cronExpression: parsed.cronExpression ?? current.cronExpression,
    enabled: current.enabled,
    input: parsed.input ?? parseJson(current.inputJson, {}),
    name: parsed.name ?? current.name,
    naturalLanguage: current.naturalLanguage,
    outputChannel: parseOutputChannel(parsed.outputTarget) ?? current.outputChannel,
    runAt: parsed.runAt ? toLocalDateTime(parsed.runAt) : current.runAt,
    targetRef: parsed.targetRef ?? parseJson(current.targetRefJson, {}),
    targetType: (parsed.targetType ?? current.targetType) as TargetChoice,
    timezone: parsed.timezone,
  });
}

function draftFromSchedule(schedule: ScheduleSummary): ScheduleDraft {
  return draftFromRecords({
    cronExpression: schedule.cronExpression ?? "",
    enabled: schedule.enabled,
    input: schedule.input,
    name: schedule.name,
    naturalLanguage: schedule.naturalLanguage ?? "",
    outputChannel: parseOutputChannel(schedule.notificationPolicy) ?? "IN_APP",
    runAt: schedule.runAt ? toLocalDateTime(schedule.runAt) : "",
    targetRef: schedule.targetRef,
    targetType: schedule.targetType,
    timezone: schedule.timezone,
  });
}

function draftFromRecords({
  cronExpression,
  enabled,
  input,
  name,
  naturalLanguage,
  outputChannel = "IN_APP",
  runAt,
  targetRef,
  targetType,
  timezone,
}: {
  cronExpression: string;
  enabled: boolean;
  input: Record<string, unknown>;
  name: string;
  naturalLanguage: string;
  outputChannel?: OutputChannel;
  runAt: string;
  targetRef: Record<string, unknown>;
  targetType: ScheduleTargetType;
  timezone: string;
}): ScheduleDraft {
  const company = typeof input.company === "string" ? input.company : "";
  const goal = typeof input.goal === "string" ? input.goal : typeof targetRef.goal === "string" ? targetRef.goal : "";
  const skillSlug = typeof targetRef.skillSlug === "string" ? targetRef.skillSlug : typeof targetRef.skillId === "string" ? targetRef.skillId : "research-company";
  return {
    advancedEdited: false,
    company,
    cronExpression,
    dayOfMonth: parseCronParts(cronExpression).dayOfMonth,
    dayOfWeek: parseCronParts(cronExpression).dayOfWeek,
    depth: typeof input.depth === "string" ? input.depth : "standard",
    detailsOpen: Boolean(name || naturalLanguage),
    enabled,
    frequency: frequencyFromSchedule({ cronExpression, runAt }),
    goal,
    inputJson: JSON.stringify(input, null, 2),
    name,
    naturalLanguage,
    outputChannel,
    runAt,
    targetRefJson: JSON.stringify(targetRef, null, 2),
    targetSkillSlug: skillSlug,
    targetType: targetType as TargetChoice,
    time: parseCronParts(cronExpression).time,
    timezone,
  };
}

function buildCreateRequest(draft: ScheduleDraft) {
  const structuredTargetRef = targetRefForDraft(draft);
  const structuredInput = inputForDraft(draft);
  const targetRef = draft.advancedEdited ? parseJson(draft.targetRefJson, structuredTargetRef) : structuredTargetRef;
  const input = draft.advancedEdited ? parseJson(draft.inputJson, structuredInput) : structuredInput;
  return stripUndefined({
    cronExpression: draft.frequency === "once" ? null : draft.cronExpression || null,
    enabled: draft.enabled,
    input,
    name: draft.name || autoName(draft),
    naturalLanguage: draft.naturalLanguage || undefined,
    notificationPolicy: { outputChannel: draft.outputChannel },
    runAt: draft.frequency === "once" && draft.runAt ? new Date(draft.runAt).toISOString() : null,
    targetRef,
    targetType: draft.targetType as ScheduleTargetType,
    timezone: draft.timezone,
  }) as Parameters<typeof createSchedule>[0]["input"];
}

function targetRefForDraft(draft: ScheduleDraft) {
  if (draft.targetType === "TASK") return taskPayloadForDraft(draft);
  if (draft.targetType === "SKILL_WORKFLOW") return parseJson(draft.targetRefJson, { workflowId: "" });
  return { skillSlug: draft.targetSkillSlug || "research-company" };
}

function inputForDraft(draft: ScheduleDraft) {
  if (draft.targetType === "TASK") return taskPayloadForDraft(draft);
  if (draft.targetSkillSlug === "research-company" || draft.targetType === "WIDE_RESEARCH") {
    return { company: draft.company || "Company", depth: draft.depth || "standard" };
  }
  return parseJson(draft.inputJson, {});
}

function taskPayloadForDraft(draft: ScheduleDraft) {
  const parsedInput = parseJson<Record<string, unknown>>(draft.inputJson, {});
  const parsedTargetRef = parseJson<Record<string, unknown>>(draft.targetRefJson, {});
  const goal = draft.goal || draft.naturalLanguage;
  if (parsedInput.directMessage === true || parsedTargetRef.directMessage === true) {
    const message = typeof parsedInput.message === "string"
      ? parsedInput.message
      : typeof parsedTargetRef.message === "string"
        ? parsedTargetRef.message
        : goal;
    return { directMessage: true, goal, message };
  }
  return { goal };
}

function schedulePatchForFrequency(draft: ScheduleDraft): Partial<ScheduleDraft> {
  const [hourRaw = "09", minuteRaw = "00"] = draft.time.split(":");
  const hour = Number.parseInt(hourRaw, 10) || 9;
  const minute = Number.parseInt(minuteRaw, 10) || 0;
  if (draft.frequency === "hourly") return { cronExpression: "0 * * * *", runAt: "" };
  if (draft.frequency === "daily") return { cronExpression: `${minute} ${hour} * * *`, runAt: "" };
  if (draft.frequency === "weekdays") return { cronExpression: `${minute} ${hour} * * 1-5`, runAt: "" };
  if (draft.frequency === "weekly") return { cronExpression: `${minute} ${hour} * * ${draft.dayOfWeek || "1"}`, runAt: "" };
  if (draft.frequency === "monthly") return { cronExpression: `${minute} ${hour} ${Number.parseInt(draft.dayOfMonth, 10) || 1} * *`, runAt: "" };
  if (draft.frequency === "custom") return { cronExpression: draft.cronExpression, runAt: "" };
  return { cronExpression: "", runAt: draft.runAt };
}

function nextRunsForDraft(draft: ScheduleDraft, preview: ParsedSchedulePreview | null) {
  if (preview?.nextRuns.length && preview.cronExpression === draft.cronExpression) return preview.nextRuns;
  if (draft.frequency === "once" && draft.runAt) return [new Date(draft.runAt).toISOString()];
  return clientNextRuns(draft.cronExpression);
}

function clientNextRuns(cronExpression: string) {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts;
  const minute = Number.parseInt(minuteRaw ?? "", 10);
  const hour = Number.parseInt(hourRaw ?? "", 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return [];
  const runs: string[] = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 60 && runs.length < 3; i += 1) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (cursor.getMinutes() !== minute || cursor.getHours() !== hour) continue;
    if (dayRaw !== "*" && Number.parseInt(dayRaw ?? "", 10) !== cursor.getDate()) continue;
    if (monthRaw !== "*" && Number.parseInt(monthRaw ?? "", 10) !== cursor.getMonth() + 1) continue;
    if (weekdayRaw === "1-5" && (cursor.getDay() === 0 || cursor.getDay() === 6)) continue;
    if (weekdayRaw && weekdayRaw !== "*" && weekdayRaw !== "1-5" && !weekdayRaw.split(",").includes(String(cursor.getDay()))) continue;
    runs.push(new Date(cursor).toISOString());
  }
  return runs;
}

function frequencyFromSchedule({ cronExpression, runAt }: { cronExpression: string; runAt: string }) {
  if (runAt) return "once";
  if (cronExpression === "0 * * * *") return "hourly";
  const parts = parseCronParts(cronExpression);
  if (parts.dayOfMonthRaw === "*" && parts.weekday === "*") return "daily";
  if (parts.weekday === "1-5") return "weekdays";
  if (parts.dayOfMonthRaw !== "*") return "monthly";
  if (parts.weekday !== "*") return "weekly";
  if (cronExpression) return "daily";
  return "weekdays";
}

function parseCronParts(cronExpression: string) {
  const [minute = "0", hour = "9", dayOfMonth = "*", , weekday = "*"] = cronExpression.trim().split(/\s+/);
  return {
    dayOfMonth: dayOfMonth === "*" ? "1" : dayOfMonth,
    dayOfMonthRaw: dayOfMonth,
    dayOfWeek: weekday === "1-5" || weekday === "*" ? "1" : weekday,
    time: `${String(Number.parseInt(hour, 10) || 9).padStart(2, "0")}:${String(Number.parseInt(minute, 10) || 0).padStart(2, "0")}`,
    weekday,
  };
}

function autoName(draft: ScheduleDraft) {
  if (draft.company) return `Research ${draft.company} ${draft.frequency === "weekdays" ? "weekday digest" : "schedule"}`;
  if (draft.goal) return draft.goal.slice(0, 80);
  return "New schedule";
}

function humanTarget(draft: ScheduleDraft) {
  if (draft.targetType === "TASK") return draft.goal || draft.naturalLanguage || "Task";
  const skill = skillOptions.find((option) => option.value === draft.targetSkillSlug)?.label ?? "Skill";
  if (draft.targetSkillSlug === "research-company" || draft.targetType === "WIDE_RESEARCH") {
    return `${skill}: ${draft.company || "company"} (${draft.depth})`;
  }
  return skill;
}

function humanWhen(draft: ScheduleDraft) {
  if (draft.frequency === "once") return draft.runAt ? `Once at ${formatDate(new Date(draft.runAt).toISOString())}` : "One-time run";
  if (draft.frequency === "hourly") return "Hourly";
  if (draft.frequency === "daily") return `Daily at ${formatTimeLabel(draft.time)}`;
  if (draft.frequency === "weekdays") return `Every weekday at ${formatTimeLabel(draft.time)}`;
  if (draft.frequency === "weekly") return `Weekly on ${dayName(draft.dayOfWeek)} at ${formatTimeLabel(draft.time)}`;
  if (draft.frequency === "monthly") return `Monthly on day ${draft.dayOfMonth || "1"} at ${formatTimeLabel(draft.time)}`;
  return draft.cronExpression || "Custom cron";
}

function formatTimeLabel(value: string) {
  const [hourRaw = "9", minuteRaw = "00"] = value.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function humanOutput(channel: OutputChannel) {
  if (channel === "EMAIL") return "Email via configured notification address";
  if (channel === "SLACK") return "Slack via configured notification channel";
  if (channel === "WEBHOOK") return "Webhook via configured notification URL";
  return "Handle schedule history";
}

function parseOutputChannel(value: unknown): OutputChannel | null {
  if (!value || typeof value !== "object") return null;
  const channel = "channel" in value ? value.channel : "outputChannel" in value ? value.outputChannel : null;
  return channel === "EMAIL" || channel === "SLACK" || channel === "WEBHOOK" || channel === "IN_APP" ? channel : null;
}

function dayName(value: string) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number.parseInt(value, 10) || 0] ?? "Monday";
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface ScheduleDraft {
  advancedEdited: boolean;
  company: string;
  cronExpression: string;
  dayOfMonth: string;
  dayOfWeek: string;
  depth: string;
  detailsOpen: boolean;
  enabled: boolean;
  frequency: Frequency;
  goal: string;
  inputJson: string;
  name: string;
  naturalLanguage: string;
  outputChannel: OutputChannel;
  runAt: string;
  targetRefJson: string;
  targetSkillSlug: string;
  targetType: TargetChoice;
  time: string;
  timezone: string;
}

function parseJson<T = unknown>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
