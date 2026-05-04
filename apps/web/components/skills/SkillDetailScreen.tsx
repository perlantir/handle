"use client";

import { useEffect, useMemo, useState } from "react";
import type { SkillDetail, SkillInputSlotSummary, SkillRunDetail } from "@handle/shared";
import { ArrowLeft, Check, Loader2, Play, ShieldCheck, XCircle } from "lucide-react";
import { PillButton } from "@/components/design-system";
import { useHandleAuth } from "@/lib/handleAuth";
import { getSkill, runSkill } from "@/lib/skills";
import { cn } from "@/lib/utils";

export function SkillDetailScreen({ skillId }: { skillId: string }) {
  const { getToken, isLoaded } = useHandleAuth();
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<SkillRunDetail | null>(null);
  const [skill, setSkill] = useState<SkillDetail | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const loaded = await getSkill({ skillId, token });
        if (cancelled) return;
        setSkill(loaded);
        setInputs(defaultInputs(loaded.inputSlots));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Skill");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, skillId]);

  const canRun = useMemo(() => Boolean(skill && skill.inputSlots.every((slot) => !slot.required || hasValue(inputs[slot.id]))), [inputs, skill]);

  async function handleRun() {
    if (!skill) return;
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      const token = await getToken();
      const result = await runSkill({
        input: { inputs },
        skillId: skill.id,
        token,
      });
      setRun(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skill run failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-bg-base px-8 py-8 text-[13px] text-text-secondary">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading Skill
      </main>
    );
  }

  if (error && !skill) {
    return <ErrorState message={error} />;
  }

  if (!skill) return <ErrorState message="Skill unavailable" />;

  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <a className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-primary" href="/skills">
            <ArrowLeft className="h-3.5 w-3.5" />
            Skills
          </a>
          <div className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11.5px] uppercase tracking-[0.04em] text-text-muted">{skill.category}</p>
                <h1 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.02em]">{skill.name}</h1>
                <p className="mt-2 max-w-[760px] text-[13px] leading-5 text-text-secondary">{skill.description}</p>
              </div>
              <span className="rounded-pill border border-border-subtle px-2.5 py-1 text-[11px] text-text-tertiary">
                {skill.sourceType.toLowerCase()} · v{skill.version}
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <PolicyCard label="Runtime" value={policySummary(skill.runtimePolicy)} />
              <PolicyCard label="Tools" value={toolSummary(skill.toolPolicy)} />
              <PolicyCard label="Approvals" value={approvalSummary(skill.approvalPolicy)} />
            </div>
          </div>

          <section className="mt-5 rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Instructions</h2>
            <div className="mt-4 grid gap-4">
              {skill.markdownSections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-[12px] font-semibold text-text-primary">{section.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-text-secondary">{section.content}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Artifact Contract</h2>
            <pre className="mt-3 overflow-auto rounded-[8px] border border-border-subtle bg-bg-base p-3 text-[12px] text-text-secondary">
              {JSON.stringify(skill.outputArtifactContract, null, 2)}
            </pre>
          </section>
        </section>

        <aside className="grid h-fit gap-4">
          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Run Skill</h2>
            <div className="mt-4 grid gap-3">
              {skill.inputSlots.map((slot) => (
                <InputSlot
                  key={slot.id}
                  onChange={(value) => setInputs((current) => ({ ...current, [slot.id]: value }))}
                  slot={slot}
                  value={inputs[slot.id]}
                />
              ))}
            </div>
            <PillButton className="mt-4 w-full justify-center gap-2" disabled={!canRun || running} onClick={handleRun} variant="primary">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Running" : "Run Skill"}
            </PillButton>
            {error ? <p className="mt-3 text-[12px] text-status-error">{error}</p> : null}
            {run ? (
              <a className={cn("mt-4 flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px]", run.status === "COMPLETED" ? "border-status-success/20 bg-status-success/5 text-status-success" : "border-status-error/20 bg-status-error/5 text-status-error")} href={`/skill-runs/${run.id}`}>
                {run.status === "COMPLETED" ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {run.status.toLowerCase()} · open trace
              </a>
            ) : null}
          </section>

          <section className="rounded-[8px] border border-border-subtle bg-bg-canvas p-5">
            <h2 className="text-[14px] font-semibold">Integrations</h2>
            <div className="mt-3 grid gap-2">
              {(skill.requiredIntegrations.length ? skill.requiredIntegrations : ["none"]).map((item) => (
                <div className="flex items-center gap-2 text-[12.5px] text-text-secondary" key={item}>
                  <ShieldCheck className="h-3.5 w-3.5 text-text-muted" />
                  {item === "none" ? "No required integrations" : item}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function InputSlot({ onChange, slot, value }: { onChange: (value: unknown) => void; slot: SkillInputSlotSummary; value: unknown }) {
  const common = "mt-1 w-full rounded-[8px] border border-border-subtle bg-bg-base px-3 py-2 text-[12.5px] text-text-primary outline-none";
  return (
    <label className="block text-[12px] font-medium text-text-secondary">
      {slot.label}{slot.required ? " *" : ""}
      {slot.type === "textarea" ? (
        <textarea className={`${common} min-h-[86px]`} onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""} />
      ) : slot.type === "select" ? (
        <select className={common} onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""}>
          {(slot.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : slot.type === "multi_select" ? (
        <select className={common} multiple onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))} value={Array.isArray(value) ? value.map(String) : []}>
          {(slot.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input className={common} onChange={(event) => onChange(event.target.value)} type={slot.type === "number" ? "number" : slot.type === "date" ? "date" : "text"} value={typeof value === "string" ? value : ""} />
      )}
      {slot.description ? <span className="mt-1 block text-[11px] text-text-tertiary">{slot.description}</span> : null}
    </label>
  );
}

function PolicyCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-bg-base p-3">
      <div className="text-[11px] uppercase tracking-[0.04em] text-text-muted">{label}</div>
      <div className="mt-1 text-[12.5px] text-text-secondary">{value}</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-bg-base px-8 py-8">
      <div className="rounded-[8px] border border-status-error/20 bg-status-error/5 px-4 py-3 text-[13px] text-status-error">{message}</div>
    </main>
  );
}

function defaultInputs(slots: SkillInputSlotSummary[]) {
  return Object.fromEntries(slots.map((slot) => [slot.id, slot.defaultValue ?? ""]));
}

function hasValue(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function policySummary(policy: Record<string, unknown>) {
  const duration = typeof policy.maxDurationMinutes === "number" ? `${policy.maxDurationMinutes} min` : "bounded";
  const filesystem = typeof policy.filesystem === "string" ? policy.filesystem.toLowerCase() : "policy";
  return `${duration} · ${filesystem}`;
}

function toolSummary(policy: Record<string, unknown>) {
  const tools = Array.isArray(policy.allowedTools) ? policy.allowedTools.length : 0;
  const connectors = Array.isArray(policy.allowedConnectors) ? policy.allowedConnectors.length : 0;
  return `${tools} tools · ${connectors} connector(s)`;
}

function approvalSummary(policy: Record<string, unknown>) {
  return policy.requireBeforeWrites || policy.requireBeforeExternalSend ? "Writes approval-gated" : "Read-first";
}
