"use client";

import { Check, Loader2, Play, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkflowSummary } from "@handle/shared";
import { PillButton, Toggle } from "@/components/design-system";
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  runWorkflowNow,
  updateWorkflow,
  type WorkflowInput,
} from "@/lib/workflows";
import { cn } from "@/lib/utils";

const emptyDraft: WorkflowInput = {
  actions: [
    {
      connectorId: "slack",
      params: { channel: "#releases", text: "A release event happened." },
      toolName: "slack.send_message",
    },
  ],
  enabled: false,
  name: "",
  triggerConnectorId: "github",
  triggerEventType: "pull_request.merged",
  triggerFilter: {},
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function WorkflowsSettings() {
  const [draft, setDraft] = useState({
    ...emptyDraft,
    actionsJson: JSON.stringify(emptyDraft.actions, null, 2),
    triggerFilterJson: "{}",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    listWorkflows()
      .then((items) => {
        if (!cancelled) setWorkflows(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load workflows");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveWorkflow() {
    setSaving(true);
    setStatus(null);
    try {
      const workflow = await createWorkflow({
        actions: parseJson(draft.actionsJson, []),
        enabled: draft.enabled,
        name: draft.name.trim(),
        triggerConnectorId: draft.triggerConnectorId.trim(),
        triggerEventType: draft.triggerEventType.trim(),
        triggerFilter: parseJson(draft.triggerFilterJson, {}),
      });
      setWorkflows((current) => [workflow, ...current]);
      setDraft({
        ...emptyDraft,
        actionsJson: JSON.stringify(emptyDraft.actions, null, 2),
        triggerFilterJson: "{}",
      });
      setStatus({ message: "Workflow saved", tone: "success" });
    } catch (err) {
      setStatus({ message: err instanceof Error ? err.message : "Could not save workflow", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleWorkflow(workflow: WorkflowSummary) {
    const updated = await updateWorkflow(workflow.id, { enabled: !workflow.enabled });
    setWorkflows((current) => current.map((item) => (item.id === workflow.id ? updated : item)));
  }

  async function removeWorkflow(workflow: WorkflowSummary) {
    await deleteWorkflow(workflow.id);
    setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
  }

  async function runNow(workflow: WorkflowSummary) {
    setRunning(workflow.id);
    setStatus(null);
    try {
      const result = await runWorkflowNow(workflow.id, { source: "manual-ui-smoke" });
      setStatus({ message: `Workflow run ${result.status.toLowerCase()}`, tone: result.status === "COMPLETED" ? "success" : "error" });
    } catch (err) {
      setStatus({ message: err instanceof Error ? err.message : "Workflow run failed", tone: "error" });
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading workflows
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12.5px] text-status-error">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
        <h2 className="m-0 text-[13px] font-medium text-text-primary">New workflow</h2>
        <div className="mt-3 grid gap-3">
          <input
            aria-label="Workflow name"
            className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Post merged PRs to Slack"
            value={draft.name}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              aria-label="Workflow trigger connector"
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, triggerConnectorId: event.target.value }))}
              value={draft.triggerConnectorId}
            />
            <input
              aria-label="Workflow trigger event"
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, triggerEventType: event.target.value }))}
              value={draft.triggerEventType}
            />
          </div>
          <textarea
            aria-label="Workflow trigger filter JSON"
            className="min-h-[72px] rounded-md border border-border-subtle bg-bg-canvas p-3 font-mono text-[12px] text-text-primary outline-none"
            onChange={(event) => setDraft((current) => ({ ...current, triggerFilterJson: event.target.value }))}
            value={draft.triggerFilterJson}
          />
          <textarea
            aria-label="Workflow actions JSON"
            className="min-h-[120px] rounded-md border border-border-subtle bg-bg-canvas p-3 font-mono text-[12px] text-text-primary outline-none"
            onChange={(event) => setDraft((current) => ({ ...current, actionsJson: event.target.value }))}
            value={draft.actionsJson}
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
              Enabled
              <Toggle aria-label="Workflow enabled" checked={draft.enabled} onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} />
            </label>
            <PillButton disabled={saving || !draft.name.trim()} onClick={saveWorkflow} variant="primary">
              {saving ? "Saving" : "Save workflow"}
            </PillButton>
            {status ? (
              <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium", status.tone === "success" ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error")}>
                {status.tone === "success" ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {status.message}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {workflows.map((workflow) => (
        <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-4" key={workflow.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[13px] font-medium text-text-primary">{workflow.name}</h2>
              <p className="m-0 mt-1 text-[11.5px] text-text-tertiary">
                {workflow.triggerConnectorId} · {workflow.triggerEventType} · {workflow.actions.length} action(s)
              </p>
            </div>
            <Toggle aria-label={`${workflow.name} enabled`} checked={workflow.enabled} onClick={() => void toggleWorkflow(workflow)} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PillButton className="gap-1.5" disabled={running === workflow.id} onClick={() => runNow(workflow)} variant="secondary">
              <Play className="h-3.5 w-3.5" />
              {running === workflow.id ? "Running" : "Run now"}
            </PillButton>
            <button
              aria-label={`Delete ${workflow.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-tertiary hover:text-status-error"
              onClick={() => void removeWorkflow(workflow)}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
