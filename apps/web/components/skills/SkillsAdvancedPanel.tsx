"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type {
  CreateSkillRequest,
  IntegrationConnectorId,
  SkillDetail,
  SkillImportBundle,
  SkillScheduleSummary,
  SkillSummary,
  SkillWorkflowSummary,
} from "@handle/shared";
import { Download, Loader2, Play, Plus, Upload } from "lucide-react";
import { PillButton } from "@/components/design-system";
import {
  createSkill,
  createSkillSchedule,
  createSkillWorkflow,
  exportSkill,
  importSkill,
  runSkill,
  runSkillScheduleNow,
  runSkillWorkflow,
} from "@/lib/skills";

const REQUIRED_SKILL_MD = `## Overview
Describe what this Skill does.

## Activation
Use this Skill when the user asks for this workflow.

## Inputs
List the required inputs.

## Workflow
Describe the ordered execution path.

## Tools
List allowed tools and integrations.

## Safety
Describe safety and approval boundaries.

## Artifacts
Describe produced artifacts.

## Citations
Explain citation requirements.

## Evaluation
Describe happy-path and safety evals.`;

const CONNECTORS: IntegrationConnectorId[] = [
  "gmail",
  "slack",
  "notion",
  "google-drive",
  "github",
  "google-calendar",
  "cloudflare",
  "vercel",
  "linear",
  "google-sheets",
  "google-docs",
  "zapier",
  "obsidian",
];

export function CustomSkillPanel({
  onCreated,
  skills,
  token,
}: {
  onCreated: (skill: SkillDetail) => void;
  skills: SkillSummary[];
  token: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputSlots, setInputSlots] = useState('[{"id":"topic","label":"Topic","type":"text","required":true}]');
  const [name, setName] = useState("Custom Research Skill");
  const [requiredIntegrations, setRequiredIntegrations] = useState<IntegrationConnectorId[]>([]);
  const [skillMd, setSkillMd] = useState(REQUIRED_SKILL_MD);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"PERSONAL" | "PROJECT">("PERSONAL");

  async function handleCreate() {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const createdSkill = await createSkill({
        input: {
          approvalPolicy: { requireBeforeWrites: true },
          category: "custom",
          description: "User-created Skill package.",
          icon: { kind: "letter", value: name.slice(0, 1).toUpperCase() || "S" },
          inputSlots: parseJson(inputSlots, []),
          name,
          outputArtifactContract: { required: [{ kind: "CUSTOM_MARKDOWN", mimeType: "text/markdown", title: "Skill output" }] },
          requiredIntegrations,
          runtimePolicy: { browserModes: ["server_browser"], filesystem: "PROJECT_WORKSPACE", maxDurationMinutes: 30 },
          schedulingConfig: { allowed: true },
          skillMd,
          sourceCitationPolicy: { required: false },
          toolPolicy: { allowedConnectors: requiredIntegrations, allowedTools: [] },
          visibility,
        } satisfies CreateSkillRequest,
        token,
      });
      setCreated(createdSkill);
      onCreated(createdSkill);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create Skill");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      const run = await runSkill({
        input: { inputs: { topic: "Stage 2 UI test" }, trigger: "SUGGESTED" },
        skillId: created.id,
        token,
      });
      setTestResult(`${run.status.toLowerCase()} · ${run.resultSummary ?? "open trace"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not test Skill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Create Custom Skill</h2>
            <p className="mt-1 text-[12px] text-text-secondary">Structured package editor with policy, integrations, inputs, and eval-ready instructions.</p>
          </div>
          <PillButton className="gap-2" disabled={busy} onClick={handleCreate} variant="primary">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save Skill
          </PillButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className={fieldClass} onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field label="Visibility">
            <select className={fieldClass} onChange={(event) => setVisibility(event.target.value as "PERSONAL" | "PROJECT")} value={visibility}>
              <option value="PERSONAL">Personal library</option>
              <option value="PROJECT">Project library</option>
            </select>
          </Field>
        </div>
        <Field label="Required integrations">
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTORS.map((connector) => (
              <label className="flex items-center gap-2 rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-secondary" key={connector}>
                <input
                  checked={requiredIntegrations.includes(connector)}
                  onChange={(event) => setRequiredIntegrations((current) => event.target.checked ? [...current, connector] : current.filter((item) => item !== connector))}
                  type="checkbox"
                />
                {connector}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Input slots JSON">
          <textarea className={`${fieldClass} min-h-[88px] font-mono`} onChange={(event) => setInputSlots(event.target.value)} value={inputSlots} />
        </Field>
        <Field label="SKILL.md">
          <textarea className={`${fieldClass} min-h-[300px] font-mono`} onChange={(event) => setSkillMd(event.target.value)} value={skillMd} />
        </Field>
        {error ? <p className="mt-3 text-[12px] text-status-error">{error}</p> : null}
      </section>
      <section className="h-fit rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
        <h2 className="text-[14px] font-semibold">Test Harness</h2>
        <p className="mt-1 text-[12px] text-text-secondary">Run the saved Skill with sample input before using it in workflows or schedules.</p>
        {created ? (
          <>
            <div className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] text-text-secondary">
              Saved as <span className="font-medium text-text-primary">{created.name}</span>
            </div>
            <PillButton className="mt-3 w-full justify-center gap-2" disabled={busy} onClick={handleTest} variant="secondary">
              <Play className="h-3.5 w-3.5" />
              Test Run
            </PillButton>
            {testResult ? <p className="mt-3 text-[12px] text-status-success">{testResult}</p> : null}
          </>
        ) : (
          <div className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] text-text-tertiary">
            Save a Skill to enable test runs.
          </div>
        )}
        <div className="mt-5 text-[11.5px] text-text-tertiary">{skills.length} Skills available for workflows.</div>
      </section>
    </div>
  );
}

export function WorkflowPanel({
  onCreated,
  skills,
  token,
  workflows,
}: {
  onCreated: (workflow: SkillWorkflowSummary) => void;
  skills: SkillSummary[];
  token: string | null;
  workflows: SkillWorkflowSummary[];
}) {
  const firstSkill = skills[0]?.id ?? "";
  const secondSkill = skills[1]?.id ?? firstSkill;
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [name, setName] = useState("Skill workflow");
  const [primarySkillId, setPrimarySkillId] = useState(firstSkill);
  const [result, setResult] = useState<string | null>(null);
  const [secondarySkillId, setSecondarySkillId] = useState(secondSkill);

  async function handleCreateWorkflow() {
    setBusy(true);
    setResult(null);
    try {
      const nodes = mode === "parallel"
        ? [
            { dependsOn: [], id: "step-a", inputs: defaultInputsForSkill(skills, primarySkillId), parallelGroup: "parallel-1", skillId: primarySkillId },
            { dependsOn: [], id: "step-b", inputs: defaultInputsForSkill(skills, secondarySkillId), parallelGroup: "parallel-1", skillId: secondarySkillId },
          ]
        : [
            { dependsOn: [], id: "step-a", inputs: defaultInputsForSkill(skills, primarySkillId), skillId: primarySkillId },
            { dependsOn: ["step-a"], id: "step-b", inputs: defaultInputsForSkill(skills, secondarySkillId), skillId: secondarySkillId },
          ];
      const workflow = await createSkillWorkflow({
        input: { graph: { artifactBindings: [], nodes }, name },
        token,
      });
      onCreated(workflow);
      const run = await runSkillWorkflow({ token, workflowId: workflow.id });
      setResult(`${run.status.toLowerCase()} · ${workflow.name}`);
    } catch (err) {
      setResult(err instanceof Error ? `failed · ${err.message}` : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
        <h2 className="text-[15px] font-semibold">Multi-Skill Workflow Builder</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name"><input className={fieldClass} onChange={(event) => setName(event.target.value)} value={name} /></Field>
          <Field label="Mode">
            <select className={fieldClass} onChange={(event) => setMode(event.target.value as "sequential" | "parallel")} value={mode}>
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel when safe</option>
            </select>
          </Field>
          <Field label="Step A Skill"><SkillSelect onChange={setPrimarySkillId} skills={skills} value={primarySkillId} /></Field>
          <Field label="Step B Skill"><SkillSelect onChange={setSecondarySkillId} skills={skills} value={secondarySkillId} /></Field>
        </div>
        <PillButton className="mt-4 gap-2" disabled={busy || !primarySkillId || !secondarySkillId} onClick={handleCreateWorkflow} variant="primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Save & Run Workflow
        </PillButton>
        {result ? <p className="mt-3 text-[12px] text-text-secondary">{result}</p> : null}
      </section>
      <ListPanel empty="No workflows yet." items={workflows.map((workflow) => `${workflow.name} · ${workflow.recentRun?.status?.toLowerCase() ?? "ready"}`)} title="Workflow Runs" />
    </div>
  );
}

export function SchedulePanel({
  onCreated,
  schedules,
  skills,
  token,
}: {
  onCreated: (schedule: SkillScheduleSummary) => void;
  schedules: SkillScheduleSummary[];
  skills: SkillSummary[];
  token: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [name, setName] = useState("Daily Skill run");
  const [result, setResult] = useState<string | null>(null);
  const [skillId, setSkillId] = useState(skills[0]?.id ?? "");

  async function handleCreateSchedule() {
    setBusy(true);
    setResult(null);
    try {
      const schedule = await createSkillSchedule({
        input: {
          cronExpression,
          enabled: false,
          inputs: defaultInputsForSkill(skills, skillId),
          name,
          skillId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
        },
        token,
      });
      onCreated(schedule);
      const run = await runSkillScheduleNow({ scheduleId: schedule.id, token });
      setResult(`${run.status.toLowerCase()} · ${run.resultSummary ?? schedule.name}`);
    } catch (err) {
      setResult(err instanceof Error ? `failed · ${err.message}` : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
        <h2 className="text-[15px] font-semibold">Schedule Skill Run</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name"><input className={fieldClass} onChange={(event) => setName(event.target.value)} value={name} /></Field>
          <Field label="Skill"><SkillSelect onChange={setSkillId} skills={skills} value={skillId} /></Field>
          <Field label="Cron expression"><input className={`${fieldClass} font-mono`} onChange={(event) => setCronExpression(event.target.value)} value={cronExpression} /></Field>
          <Field label="Temporal status"><div className={`${fieldClass} text-status-success`}>Temporal-ready · run-now smoke available</div></Field>
        </div>
        <PillButton className="mt-4 gap-2" disabled={busy || !skillId} onClick={handleCreateSchedule} variant="primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Save & Run Now
        </PillButton>
        {result ? <p className="mt-3 text-[12px] text-text-secondary">{result}</p> : null}
      </section>
      <ListPanel empty="No schedules yet." items={schedules.map((schedule) => `${schedule.name} · ${schedule.cronExpression ?? schedule.runAt ?? "manual"} · ${schedule.lastRunAt ? "ran" : "not run"}`)} title="Scheduled Runs" />
    </div>
  );
}

export function ImportExportPanel({
  skills,
  token,
}: {
  skills: SkillSummary[];
  token: string | null;
}) {
  const [bundleText, setBundleText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [skillId, setSkillId] = useState(skills[0]?.id ?? "");

  async function handleExport() {
    const bundle = await exportSkill({ skillId, token });
    setBundleText(JSON.stringify(bundle, null, 2));
    setMessage("Export bundle generated.");
  }

  async function handleImport() {
    const bundle = parseJson<SkillImportBundle | null>(bundleText, null);
    if (!bundle) {
      setMessage("Import failed: bundle JSON is invalid.");
      return;
    }
    const skill = await importSkill({ bundle, token });
    setMessage(`Imported ${skill.name}.`);
  }

  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
      <h2 className="text-[15px] font-semibold">Skill Import / Export</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <SkillSelect onChange={setSkillId} skills={skills} value={skillId} />
        <PillButton className="gap-2" onClick={handleExport} variant="secondary"><Download className="h-3.5 w-3.5" />Export</PillButton>
        <PillButton className="gap-2" onClick={handleImport} variant="primary"><Upload className="h-3.5 w-3.5" />Import</PillButton>
      </div>
      <textarea className={`${fieldClass} mt-4 min-h-[340px] font-mono`} onChange={(event) => setBundleText(event.target.value)} placeholder="Exported Skill bundle JSON appears here. Paste a bundle to import." value={bundleText} />
      {message ? <p className="mt-3 text-[12px] text-text-secondary">{message}</p> : null}
    </section>
  );
}

function SkillSelect({ onChange, skills, value }: { onChange: (value: string) => void; skills: SkillSummary[]; value: string }) {
  return (
    <select className={fieldClass} onChange={(event) => onChange(event.target.value)} value={value}>
      {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
    </select>
  );
}

function ListPanel({ empty, items, title }: { empty: string; items: string[]; title: string }) {
  return (
    <section className="h-fit rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <div className="mt-3 grid gap-2">
        {items.length === 0 ? (
          <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] text-text-tertiary">{empty}</div>
        ) : items.map((item) => (
          <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] text-text-secondary" key={item}>{item}</div>
        ))}
      </div>
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block text-[12px] font-medium text-text-secondary">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function defaultInputsForSkill(skills: SkillSummary[], skillId: string) {
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) return {};
  return Object.fromEntries(skill.inputSlots.map((slot) => [slot.id, slot.defaultValue ?? defaultValueForSlot(slot.id)]));
}

function defaultValueForSlot(id: string) {
  if (id === "company") return "Acme";
  if (id === "depth") return "quick";
  if (id === "topic") return "Stage 2";
  if (id === "trip") return "Chicago weekend";
  return "Stage 2 sample";
}

function parseJson<T = unknown>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const fieldClass = "w-full rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12.5px] text-text-primary outline-none";
