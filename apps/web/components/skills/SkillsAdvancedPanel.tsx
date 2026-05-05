"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type {
  CreateSkillRequest,
  IntegrationConnectorId,
  SkillInputSlotSummary,
  SkillDetail,
  SkillImportBundle,
  SkillScheduleSummary,
  SkillSummary,
  SkillWorkflowSummary,
} from "@handle/shared";
import { ArrowDown, ArrowUp, Download, GripVertical, Loader2, Play, Plus, Trash2, Upload } from "lucide-react";
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

const SLOT_TYPES: SkillInputSlotSummary["type"][] = [
  "text",
  "textarea",
  "number",
  "select",
  "multi_select",
  "repository",
  "notion_page",
  "url",
  "email",
  "date",
];

const DEFAULT_SLOT: SkillInputSlotSummary = {
  id: "topic",
  label: "Topic",
  required: true,
  type: "text",
};

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
  const [inputSlots, setInputSlots] = useState<SkillInputSlotSummary[]>([DEFAULT_SLOT]);
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
          inputSlots: normalizeSlots(inputSlots),
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
        input: { inputs: defaultInputsForSlots(inputSlots), trigger: "SUGGESTED" },
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
        <InputSlotBuilder onChange={setInputSlots} slots={inputSlots} />
        <InputSlotPreview slots={inputSlots} />
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
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [name, setName] = useState("Skill workflow");
  const [result, setResult] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStepDraft[]>([
    { artifactInputs: {}, id: "step-a", inputs: {}, skillId: firstSkill },
    { artifactInputs: {}, id: "step-b", inputs: {}, skillId: skills[1]?.id ?? firstSkill },
  ]);

  const validSteps = steps.filter((step) => step.skillId);

  async function handleCreateWorkflow() {
    setBusy(true);
    setResult(null);
    try {
      const nodes = validSteps.map((step, index) => {
        const previousStep = validSteps[index - 1];
        const node = {
          dependsOn: mode === "parallel" || !previousStep ? [] : [previousStep.id],
          id: step.id,
          inputs: {
          ...defaultInputsForSkill(skills, step.skillId),
          ...step.inputs,
        },
          skillId: step.skillId,
        };
        return mode === "parallel" ? { ...node, parallelGroup: "parallel-1" } : node;
      });
      const artifactBindings = validSteps.flatMap((step) =>
        Object.entries(step.artifactInputs)
          .filter(([, fromNodeId]) => fromNodeId)
          .map(([inputSlotId, fromNodeId]) => ({
            artifactKind: "CUSTOM_MARKDOWN" as const,
            fromNodeId,
            inputSlotId,
            toNodeId: step.id,
          })),
      );
      const workflow = await createSkillWorkflow({
        input: { graph: { artifactBindings, nodes }, name },
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
        </div>
        <div className="mt-4 grid gap-3">
          {steps.map((step, index) => (
            <WorkflowStepEditor
              index={index}
              key={step.id}
              onChange={(nextStep) => setSteps((current) => current.map((item) => item.id === step.id ? nextStep : item))}
              onMoveDown={() => setSteps((current) => moveItem(current, index, index + 1))}
              onMoveUp={() => setSteps((current) => moveItem(current, index, index - 1))}
              onRemove={() => setSteps((current) => current.length > 1 ? current.filter((item) => item.id !== step.id) : current)}
              previousSteps={steps.slice(0, index)}
              skills={skills}
              step={step}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PillButton
            className="gap-2"
            onClick={() => setSteps((current) => [
              ...current,
              { artifactInputs: {}, id: `step-${String.fromCharCode(97 + current.length)}`, inputs: {}, skillId: firstSkill },
            ])}
            variant="secondary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </PillButton>
        </div>
        <PillButton className="mt-4 gap-2" disabled={busy || validSteps.length === 0} onClick={handleCreateWorkflow} variant="primary">
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
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");

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
          timezone,
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
          <div className="md:col-span-2">
            <FrequencyBuilder
              label="Skill run schedule"
              onChange={setCronExpression}
              onTimezoneChange={setTimezone}
              timezone={timezone}
              value={cronExpression}
            />
          </div>
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
  const [previewBundle, setPreviewBundle] = useState<SkillImportBundle | null>(null);
  const [skillId, setSkillId] = useState(skills[0]?.id ?? "");

  async function handleExport() {
    const bundle = await exportSkill({ skillId, token });
    const text = JSON.stringify(bundle, null, 2);
    setBundleText(text);
    setPreviewBundle(bundle);
    downloadSkillBundle(bundle);
    setMessage("Export bundle downloaded and previewed.");
  }

  async function handleImport() {
    const bundle = previewBundle ?? parseJson<SkillImportBundle | null>(bundleText, null);
    if (!bundle) {
      setMessage("Import failed: bundle JSON is invalid.");
      return;
    }
    const skill = await importSkill({ bundle, token });
    setMessage(`Imported ${skill.name}.`);
  }

  function handleBundleText(value: string) {
    setBundleText(value);
    setPreviewBundle(parseJson<SkillImportBundle | null>(value, null));
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setBundleText(text);
    const parsed = parseJson<SkillImportBundle | null>(text, null);
    setPreviewBundle(parsed);
    setMessage(parsed ? `Previewing ${parsed.manifest.name}. Confirm import when ready.` : "File could not be parsed as a Skill JSON bundle.");
  }

  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
      <h2 className="text-[15px] font-semibold">Skill Import / Export</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <SkillSelect onChange={setSkillId} skills={skills} value={skillId} />
        <PillButton className="gap-2" onClick={handleExport} variant="secondary"><Download className="h-3.5 w-3.5" />Export</PillButton>
        <PillButton className="gap-2" disabled={!previewBundle} onClick={handleImport} variant="primary"><Upload className="h-3.5 w-3.5" />Confirm import</PillButton>
      </div>
      <label className="mt-4 block rounded-[8px] border border-dashed border-border-subtle bg-bg-base p-4 text-[12px] text-text-secondary">
        Upload Skill bundle
        <input
          accept=".skill.json,.json,application/json"
          className="mt-2 block w-full text-[12px]"
          onChange={(event) => void handleFileUpload(event.target.files?.[0])}
          type="file"
        />
        <span className="mt-1 block text-[11.5px] text-text-tertiary">Upload a .skill.json bundle, or paste bundle JSON below as an advanced fallback.</span>
      </label>
      {previewBundle ? <SkillBundlePreview bundle={previewBundle} /> : null}
      <details className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-3">
        <summary className="cursor-pointer text-[12px] font-medium text-text-secondary">Advanced JSON fallback</summary>
        <textarea
          className={`${fieldClass} mt-3 min-h-[220px] font-mono`}
          onChange={(event) => handleBundleText(event.target.value)}
          placeholder="Exported Skill bundle JSON appears here. Paste a bundle to import."
          value={bundleText}
        />
      </details>
      {message ? <p className="mt-3 text-[12px] text-text-secondary">{message}</p> : null}
    </section>
  );
}

interface WorkflowStepDraft {
  artifactInputs: Record<string, string>;
  id: string;
  inputs: Record<string, string>;
  skillId: string;
}

type Frequency = "custom" | "daily" | "hourly" | "monthly" | "once" | "weekdays" | "weekly";

const DAYS = [
  { label: "Sun", value: "0" },
  { label: "Mon", value: "1" },
  { label: "Tue", value: "2" },
  { label: "Wed", value: "3" },
  { label: "Thu", value: "4" },
  { label: "Fri", value: "5" },
  { label: "Sat", value: "6" },
];

function InputSlotBuilder({
  onChange,
  slots,
}: {
  onChange: (slots: SkillInputSlotSummary[]) => void;
  slots: SkillInputSlotSummary[];
}) {
  function update(index: number, patch: Partial<SkillInputSlotSummary>) {
    onChange(slots.map((slot, slotIndex) => {
      if (slotIndex !== index) return slot;
      const next = { ...slot, ...patch };
      if (patch.label && (!slot.id || slot.id === slugify(slot.label))) {
        next.id = slugify(patch.label);
      }
      return next;
    }));
  }

  function updateOption(slotIndex: number, optionIndex: number, field: "label" | "value", value: string) {
    onChange(slots.map((slot, index) => {
      if (index !== slotIndex) return slot;
      const options = [...(slot.options ?? [])];
      const existing = options[optionIndex] ?? { label: "", value: "" };
      const nextOption = { ...existing, [field]: value };
      if (field === "label" && !nextOption.value) {
        nextOption.value = slugify(value);
      }
      options[optionIndex] = nextOption;
      return { ...slot, options };
    }));
  }

  return (
    <section className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-text-primary">Input slots</h3>
          <p className="mt-1 text-[11.5px] text-text-tertiary">Build the run form without writing JSON.</p>
        </div>
        <PillButton
          className="gap-2"
          onClick={() => onChange([...slots, { id: `input_${slots.length + 1}`, label: `Input ${slots.length + 1}`, required: false, type: "text" }])}
          variant="secondary"
        >
          <Plus className="h-3.5 w-3.5" />
          Add slot
        </PillButton>
      </div>
      <div className="mt-3 grid gap-3">
        {slots.map((slot, index) => (
          <div className="rounded-[8px] border border-border-subtle bg-bg-canvas p-3" key={`${slot.id}-${index}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] font-medium text-text-secondary">
                <GripVertical className="h-3.5 w-3.5 text-text-tertiary" />
                Slot {index + 1}
              </div>
              <div className="flex gap-1">
                <button aria-label="Move slot up" className={iconButtonClass} disabled={index === 0} onClick={() => onChange(moveItem(slots, index, index - 1))} type="button"><ArrowUp className="h-3 w-3" /></button>
                <button aria-label="Move slot down" className={iconButtonClass} disabled={index === slots.length - 1} onClick={() => onChange(moveItem(slots, index, index + 1))} type="button"><ArrowDown className="h-3 w-3" /></button>
                <button aria-label="Remove slot" className={iconButtonClass} disabled={slots.length === 1} onClick={() => onChange(slots.length > 1 ? slots.filter((_, slotIndex) => slotIndex !== index) : slots)} type="button"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Label"><input className={fieldClass} onChange={(event) => update(index, { label: event.target.value })} value={slot.label} /></Field>
              <Field label="ID"><input className={`${fieldClass} font-mono`} onChange={(event) => update(index, { id: slugify(event.target.value) })} value={slot.id} /></Field>
              <Field label="Type">
                <select className={fieldClass} onChange={(event) => update(index, { type: event.target.value as SkillInputSlotSummary["type"] })} value={slot.type}>
                  {SLOT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="Default value">
                <input className={fieldClass} onChange={(event) => update(index, { defaultValue: event.target.value })} value={stringFromUnknown(slot.defaultValue)} />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-text-secondary">
              <input checked={slot.required} onChange={(event) => update(index, { required: event.target.checked })} type="checkbox" />
              Required
            </label>
            {slot.type === "select" || slot.type === "multi_select" ? (
              <div className="mt-3 rounded-[8px] border border-border-subtle bg-bg-base p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-text-secondary">Options</span>
                  <button
                    className="rounded-pill border border-border-subtle px-2 py-1 text-[11px] text-text-secondary"
                    onClick={() => update(index, { options: [...(slot.options ?? []), { label: "Option", value: `option_${(slot.options ?? []).length + 1}` }] })}
                    type="button"
                  >
                    Add option
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  {(slot.options ?? []).map((option, optionIndex) => (
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={`${option.value}-${optionIndex}`}>
                      <input className={fieldClass} onChange={(event) => updateOption(index, optionIndex, "label", event.target.value)} placeholder="Label" value={option.label} />
                      <input className={`${fieldClass} font-mono`} onChange={(event) => updateOption(index, optionIndex, "value", event.target.value)} placeholder="value" value={option.value} />
                      <button className={iconButtonClass} onClick={() => update(index, { options: (slot.options ?? []).filter((_, itemIndex) => itemIndex !== optionIndex) })} type="button"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function InputSlotPreview({ slots }: { slots: SkillInputSlotSummary[] }) {
  return (
    <section className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-4">
      <h3 className="text-[13px] font-semibold text-text-primary">Run form preview</h3>
      <div className="mt-3 grid gap-3">
        {normalizeSlots(slots).map((slot) => (
          <Field key={slot.id} label={`${slot.label}${slot.required ? " *" : ""}`}>
            {slot.type === "textarea" ? (
              <textarea className={`${fieldClass} min-h-[72px]`} disabled placeholder={stringFromUnknown(slot.defaultValue) || "Long answer"} />
            ) : slot.type === "select" || slot.type === "multi_select" ? (
              <select className={fieldClass} disabled multiple={slot.type === "multi_select"}>
                {(slot.options ?? [{ label: "Option", value: "option" }]).map((option) => <option key={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input className={fieldClass} disabled placeholder={stringFromUnknown(slot.defaultValue) || slot.type.replaceAll("_", " ")} />
            )}
          </Field>
        ))}
      </div>
    </section>
  );
}

function WorkflowStepEditor({
  index,
  onChange,
  onMoveDown,
  onMoveUp,
  onRemove,
  previousSteps,
  skills,
  step,
}: {
  index: number;
  onChange: (step: WorkflowStepDraft) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  previousSteps: WorkflowStepDraft[];
  skills: SkillSummary[];
  step: WorkflowStepDraft;
}) {
  const skill = skills.find((item) => item.id === step.skillId);
  const slots = skill?.inputSlots ?? [];

  function updateInputs(slotId: string, value: string) {
    onChange({ ...step, inputs: { ...step.inputs, [slotId]: value } });
  }

  function updateBinding(slotId: string, fromNodeId: string) {
    onChange({
      ...step,
      artifactInputs: { ...step.artifactInputs, [slotId]: fromNodeId },
    });
  }

  return (
    <section className="rounded-[8px] border border-border-subtle bg-bg-base p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-text-secondary">
          <GripVertical className="h-3.5 w-3.5 text-text-tertiary" />
          Step {String.fromCharCode(65 + index)}
        </div>
        <div className="flex gap-1">
          <button aria-label="Move step up" className={iconButtonClass} disabled={index === 0} onClick={onMoveUp} type="button"><ArrowUp className="h-3 w-3" /></button>
          <button aria-label="Move step down" className={iconButtonClass} onClick={onMoveDown} type="button"><ArrowDown className="h-3 w-3" /></button>
          <button aria-label="Remove step" className={iconButtonClass} disabled={index === 0 && previousSteps.length === 0} onClick={onRemove} type="button"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Skill"><SkillSelect onChange={(skillId) => onChange({ ...step, artifactInputs: {}, inputs: {}, skillId })} skills={skills} value={step.skillId} /></Field>
        <Field label="Step ID"><input className={`${fieldClass} font-mono`} onChange={(event) => onChange({ ...step, id: slugify(event.target.value) || step.id })} value={step.id} /></Field>
      </div>
      {slots.length ? (
        <div className="mt-3 grid gap-3">
          {slots.map((slot) => (
            <div className="rounded-[8px] border border-border-subtle bg-bg-canvas p-3" key={slot.id}>
              <div className="text-[12px] font-medium text-text-secondary">{slot.label}</div>
              {previousSteps.length ? (
                <select
                  aria-label={`${slot.label} artifact mapping`}
                  className={`${fieldClass} mt-2`}
                  onChange={(event) => updateBinding(slot.id, event.target.value)}
                  value={step.artifactInputs[slot.id] ?? ""}
                >
                  <option value="">Use typed value</option>
                  {previousSteps.map((previousStep, previousIndex) => (
                    <option key={previousStep.id} value={previousStep.id}>
                      Output from Step {String.fromCharCode(65 + previousIndex)}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                className={`${fieldClass} mt-2`}
                disabled={Boolean(step.artifactInputs[slot.id])}
                onChange={(event) => updateInputs(slot.id, event.target.value)}
                placeholder={stringFromUnknown(slot.defaultValue) || defaultValueForSlot(slot.id)}
                value={step.inputs[slot.id] ?? ""}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FrequencyBuilder({
  label,
  onChange,
  onTimezoneChange,
  timezone,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  timezone: string;
  value: string;
}) {
  const initialFrequency = frequencyForValue(value);
  const [custom, setCustom] = useState(initialFrequency === "custom" ? value : "");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [onceAt, setOnceAt] = useState(value.startsWith("once:") ? value.slice(5) : "");
  const [selectedDays, setSelectedDays] = useState<string[]>(["1"]);
  const [time, setTime] = useState("09:00");
  const preview = useMemo(() => nextRunPreview(frequency, time, timezone), [frequency, time, timezone]);

  function updateFrequency(nextFrequency: Frequency) {
    setFrequency(nextFrequency);
    onChange(nextFrequency === "custom" ? custom : cronFor({ dayOfMonth, frequency: nextFrequency, onceAt, selectedDays, time }));
  }

  function updateSchedule(next: { dayOfMonth?: string; onceAt?: string; selectedDays?: string[]; time?: string }) {
    const nextDay = next.dayOfMonth ?? dayOfMonth;
    const nextOnce = next.onceAt ?? onceAt;
    const nextSelected = next.selectedDays ?? selectedDays;
    const nextTime = next.time ?? time;
    if (next.dayOfMonth !== undefined) setDayOfMonth(next.dayOfMonth);
    if (next.onceAt !== undefined) setOnceAt(next.onceAt);
    if (next.selectedDays !== undefined) setSelectedDays(next.selectedDays);
    if (next.time !== undefined) setTime(next.time);
    if (frequency !== "custom") onChange(cronFor({ dayOfMonth: nextDay, frequency, onceAt: nextOnce, selectedDays: nextSelected, time: nextTime }));
  }

  return (
    <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3">
      <div className="text-[12px] font-medium text-text-secondary">{label}</div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Field label="Frequency">
          <select className={fieldClass} onChange={(event) => updateFrequency(event.target.value as Frequency)} value={frequency}>
            <option value="once">Once</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays only</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom cron</option>
          </select>
        </Field>
        <Field label="Timezone">
          <input className={fieldClass} onChange={(event) => onTimezoneChange(event.target.value)} value={timezone} />
        </Field>
      </div>
      {frequency === "custom" ? (
        <Field label="Cron expression">
          <input
            className={`${fieldClass} font-mono`}
            onChange={(event) => {
              setCustom(event.target.value);
              onChange(event.target.value);
            }}
            placeholder="0 9 * * 1-5"
            value={custom}
          />
        </Field>
      ) : null}
      {frequency !== "custom" && frequency !== "hourly" && frequency !== "once" ? (
        <div className="mt-3">
          <Field label="Time"><input className={fieldClass} onChange={(event) => updateSchedule({ time: event.target.value })} type="time" value={time} /></Field>
        </div>
      ) : null}
      {frequency === "once" ? (
        <div className="mt-3">
          <Field label="Run at"><input className={fieldClass} onChange={(event) => updateSchedule({ onceAt: event.target.value })} type="datetime-local" value={onceAt} /></Field>
        </div>
      ) : null}
      {frequency === "weekly" ? (
        <div className="mt-3 grid gap-1 text-[12px] font-medium text-text-secondary">
          Days
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => (
              <button
                className={`rounded-pill border px-2 py-1 text-[11px] ${selectedDays.includes(day.value) ? "border-accent bg-accent/10 text-accent" : "border-border-subtle bg-bg-surface text-text-secondary"}`}
                key={day.value}
                onClick={() => {
                  const next = selectedDays.includes(day.value)
                    ? selectedDays.filter((item) => item !== day.value)
                    : [...selectedDays, day.value].sort();
                  updateSchedule({ selectedDays: next.length ? next : [day.value] });
                }}
                type="button"
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {frequency === "monthly" ? (
        <div className="mt-3">
          <Field label="Day of month"><input className={fieldClass} max={31} min={1} onChange={(event) => updateSchedule({ dayOfMonth: event.target.value })} type="number" value={dayOfMonth} /></Field>
        </div>
      ) : null}
      <div className="mt-3 rounded-[8px] border border-border-subtle bg-bg-canvas px-3 py-2 text-[11.5px] text-text-tertiary">
        {preview}
      </div>
    </div>
  );
}

function SkillBundlePreview({ bundle }: { bundle: SkillImportBundle }) {
  return (
    <section className="mt-4 rounded-[8px] border border-border-subtle bg-bg-base p-4">
      <h3 className="text-[13px] font-semibold text-text-primary">Import preview</h3>
      <div className="mt-3 grid gap-2 text-[12px] text-text-secondary md:grid-cols-2">
        <div><span className="font-medium text-text-primary">Name:</span> {bundle.manifest.name}</div>
        <div><span className="font-medium text-text-primary">Version:</span> {bundle.manifest.version ?? "1.0.0"}</div>
        <div><span className="font-medium text-text-primary">Integrations:</span> {(bundle.manifest.requiredIntegrations ?? []).join(", ") || "None"}</div>
        <div><span className="font-medium text-text-primary">Input slots:</span> {bundle.manifest.inputSlots?.length ?? 0}</div>
        <div><span className="font-medium text-text-primary">Source:</span> {bundle.manifest.packageMetadata?.source ? String(bundle.manifest.packageMetadata.source) : "Imported bundle"}</div>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-secondary">{bundle.manifest.description}</p>
      <pre className="mt-3 max-h-40 overflow-auto rounded-[8px] border border-border-subtle bg-bg-canvas p-3 text-[11.5px] text-text-tertiary">
        {bundle.skillMd.slice(0, 1200)}
      </pre>
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

function defaultInputsForSkill(skills: SkillSummary[], skillId: string): Record<string, unknown> {
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) return {};
  return Object.fromEntries(skill.inputSlots.map((slot) => [slot.id, slot.defaultValue ?? defaultValueForSlot(slot.id)]));
}

function defaultInputsForSlots(slots: SkillInputSlotSummary[]) {
  return Object.fromEntries(normalizeSlots(slots).map((slot) => [slot.id, slot.defaultValue ?? defaultValueForSlot(slot.id)]));
}

function defaultValueForSlot(id: string) {
  if (id === "company") return "Acme";
  if (id === "depth") return "quick";
  if (id === "topic") return "Stage 2";
  if (id === "trip") return "Chicago weekend";
  return "Stage 2 sample";
}

function normalizeSlots(slots: SkillInputSlotSummary[]) {
  return slots
    .map((slot) => ({
      ...slot,
      id: slugify(slot.id || slot.label),
      label: slot.label || "Input",
      options: slot.type === "select" || slot.type === "multi_select" ? slot.options ?? [] : undefined,
      type: slot.type || "text",
    }))
    .filter((slot) => slot.id && slot.label);
}

function stringFromUnknown(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

function splitTime(value: string) {
  const [hour = "09", minute = "00"] = value.split(":");
  return {
    hour: Number.parseInt(hour, 10) || 9,
    minute: Number.parseInt(minute, 10) || 0,
  };
}

function cronFor({
  dayOfMonth,
  frequency,
  onceAt,
  selectedDays,
  time,
}: {
  dayOfMonth: string;
  frequency: Frequency;
  onceAt: string;
  selectedDays: string[];
  time: string;
}) {
  const { hour, minute } = splitTime(time);
  if (frequency === "hourly") return "0 * * * *";
  if (frequency === "daily") return `${minute} ${hour} * * *`;
  if (frequency === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (frequency === "weekly") return `${minute} ${hour} * * ${selectedDays.length ? selectedDays.join(",") : "1"}`;
  if (frequency === "monthly") return `${minute} ${hour} ${Number.parseInt(dayOfMonth, 10) || 1} * *`;
  if (frequency === "once") return onceAt ? `once:${onceAt}` : "once:";
  return "";
}

function frequencyForValue(value: string): Frequency {
  if (value.startsWith("once:")) return "once";
  if (value === "0 * * * *") return "hourly";
  if (/^\d+ \d+ \* \* 1-5$/.test(value)) return "weekdays";
  if (/^\d+ \d+ \* \* [0-6](,[0-6])*$/.test(value)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(value)) return "monthly";
  if (/^\d+ \d+ \* \* \*$/.test(value)) return "daily";
  return "custom";
}

function nextRunPreview(frequency: Frequency, time: string, timezone: string) {
  const { hour, minute } = splitTime(time);
  const now = new Date();
  const examples = Array.from({ length: 3 }, (_, index) => {
    const next = new Date(now);
    next.setDate(now.getDate() + index + 1);
    next.setHours(hour, minute, 0, 0);
    return next.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
  });
  if (frequency === "hourly") return "Next 3 runs: at the top of the next 3 hours";
  if (frequency === "custom") return "Next runs appear after saving the custom expression.";
  if (frequency === "once") return "Runs once at the selected date and time.";
  return `Next 3 runs: ${examples.join(", ")}`;
}

function downloadSkillBundle(bundle: SkillImportBundle) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = bundle.manifest.slug ?? slugify(bundle.manifest.name);
  const version = bundle.manifest.version ?? "1.0.0";
  link.href = url;
  link.download = `${slug}-${version}.skill.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseJson<T = unknown>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const fieldClass = "w-full rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12.5px] text-text-primary outline-none";
const iconButtonClass = "inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-surface text-text-secondary disabled:cursor-not-allowed disabled:opacity-40";
