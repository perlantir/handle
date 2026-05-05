"use client";

import { Check, Loader2, Play, Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  IntegrationConnectionSummary,
  IntegrationConnectorId,
  IntegrationSettingsResponse,
  WorkflowActionDefinition,
  WorkflowSummary,
} from "@handle/shared";
import { PillButton, Toggle } from "@/components/design-system";
import { SlackChannelPicker } from "./SlackChannelPicker";
import { getIntegrationSettings } from "@/lib/settingsIntegrations";
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  runWorkflowNow,
  updateWorkflow,
  type WorkflowInput,
} from "@/lib/workflows";
import { cn } from "@/lib/utils";

type ActionParamKind = "textarea" | "text";
type ConditionOperator = "contains" | "equals" | "exists" | "not_exists" | "not_equals" | "starts_with";
type ConditionCombinator = "AND" | "OR";

interface TriggerConditionDraft {
  combinator: ConditionCombinator;
  field: string;
  operator: ConditionOperator;
  value: string;
}

interface ActionParamDefinition {
  key: string;
  label: string;
  placeholder: string;
  type?: ActionParamKind;
}

interface WorkflowActionCatalogItem {
  label: string;
  toolName: string;
  params: ActionParamDefinition[];
}

interface WorkflowActionDraft {
  connectorId: IntegrationConnectorId;
  params: Record<string, string>;
  toolName: string;
}

interface TriggerFieldDefinition {
  label: string;
  type: "boolean" | "number" | "text";
  value: string;
}

const connectorLabels: Record<IntegrationConnectorId, string> = {
  cloudflare: "Cloudflare",
  gmail: "Gmail",
  github: "GitHub",
  "google-calendar": "Google Calendar",
  "google-docs": "Google Docs",
  "google-drive": "Google Drive",
  "google-sheets": "Google Sheets",
  linear: "Linear",
  notion: "Notion",
  obsidian: "Obsidian",
  slack: "Slack",
  vercel: "Vercel",
  zapier: "Zapier",
};

const triggerEvents: Record<IntegrationConnectorId, Array<{ label: string; value: string }>> = {
  cloudflare: [
    { label: "DNS record changed", value: "dns.record_changed" },
    { label: "Pages deployment completed", value: "pages.deployment_completed" },
  ],
  gmail: [
    { label: "New email", value: "message.received" },
    { label: "Label added", value: "label.added" },
  ],
  github: [
    { label: "Push", value: "push" },
    { label: "Pull request merged", value: "pull_request.merged" },
    { label: "Issue opened", value: "issue.opened" },
  ],
  "google-calendar": [
    { label: "Event created", value: "event.created" },
    { label: "Event starting soon", value: "event.starting_soon" },
  ],
  "google-docs": [{ label: "Document updated", value: "document.updated" }],
  "google-drive": [
    { label: "File created", value: "file.created" },
    { label: "File updated", value: "file.updated" },
  ],
  "google-sheets": [{ label: "Sheet updated", value: "sheet.updated" }],
  linear: [
    { label: "Issue created", value: "issue.created" },
    { label: "Issue moved", value: "issue.moved" },
  ],
  notion: [
    { label: "Page updated", value: "page.updated" },
    { label: "Database item added", value: "database.item_added" },
  ],
  obsidian: [
    { label: "Note created", value: "note.created" },
    { label: "Note updated", value: "note.updated" },
  ],
  slack: [
    { label: "Channel message", value: "message.channels" },
    { label: "Direct message", value: "message.im" },
  ],
  vercel: [
    { label: "Deployment ready", value: "deployment.ready" },
    { label: "Deployment failed", value: "deployment.failed" },
  ],
  zapier: [
    { label: "Zap completed", value: "zap.completed" },
    { label: "Zap failed", value: "zap.failed" },
  ],
};

const defaultTriggerFields: TriggerFieldDefinition[] = [
  { label: "Resource ID", type: "text", value: "id" },
  { label: "Title", type: "text", value: "title" },
  { label: "Actor", type: "text", value: "actor" },
  { label: "Created at", type: "text", value: "createdAt" },
];

const triggerFieldCatalog: Record<string, TriggerFieldDefinition[]> = {
  "deployment.failed": [
    { label: "Project", type: "text", value: "project" },
    { label: "Environment", type: "text", value: "environment" },
    { label: "Branch", type: "text", value: "branch" },
  ],
  "deployment.ready": [
    { label: "Project", type: "text", value: "project" },
    { label: "Environment", type: "text", value: "environment" },
    { label: "Branch", type: "text", value: "branch" },
  ],
  "issue.opened": [
    { label: "Repository", type: "text", value: "repository" },
    { label: "Label", type: "text", value: "label" },
    { label: "Author", type: "text", value: "sender" },
  ],
  "message.channels": [
    { label: "Channel", type: "text", value: "channel" },
    { label: "Sender", type: "text", value: "sender" },
    { label: "Message text", type: "text", value: "text" },
  ],
  "message.received": [
    { label: "Sender domain", type: "text", value: "senderDomain" },
    { label: "Subject", type: "text", value: "subject" },
    { label: "Label", type: "text", value: "label" },
  ],
  "pull_request.merged": [
    { label: "Repository", type: "text", value: "repository" },
    { label: "Branch", type: "text", value: "branch" },
    { label: "Label", type: "text", value: "label" },
    { label: "Author", type: "text", value: "sender" },
  ],
  push: [
    { label: "Repository", type: "text", value: "repository" },
    { label: "Branch", type: "text", value: "branch" },
    { label: "Commit message", type: "text", value: "commitMessage" },
  ],
};

const actionCatalog: Record<IntegrationConnectorId, WorkflowActionCatalogItem[]> = {
  cloudflare: [
    {
      label: "Purge cache",
      params: [
        { key: "zoneId", label: "Zone ID", placeholder: "Cloudflare zone ID" },
        { key: "files", label: "Files JSON", placeholder: "[\"https://example.com/app.js\"]", type: "textarea" },
      ],
      toolName: "cloudflare.purge_cache",
    },
  ],
  gmail: [
    {
      label: "Send email",
      params: [
        { key: "to", label: "To", placeholder: "teammate@example.com" },
        { key: "subject", label: "Subject", placeholder: "Release update" },
        { key: "body", label: "Body", placeholder: "Message body", type: "textarea" },
      ],
      toolName: "gmail.send",
    },
  ],
  github: [
    {
      label: "Create issue",
      params: [
        { key: "owner", label: "Owner", placeholder: "perlantir" },
        { key: "repo", label: "Repo", placeholder: "handle" },
        { key: "title", label: "Title", placeholder: "Follow-up issue" },
        { key: "body", label: "Body", placeholder: "Issue details", type: "textarea" },
      ],
      toolName: "github.create_issue",
    },
  ],
  "google-calendar": [
    {
      label: "Create event",
      params: [
        { key: "summary", label: "Summary", placeholder: "Release review" },
        { key: "start", label: "Start", placeholder: "2026-05-04T13:00:00-05:00" },
        { key: "end", label: "End", placeholder: "2026-05-04T13:30:00-05:00" },
      ],
      toolName: "calendar.create_event",
    },
  ],
  "google-docs": [
    {
      label: "Append text",
      params: [
        { key: "documentId", label: "Document ID", placeholder: "Google Docs document ID" },
        { key: "text", label: "Text", placeholder: "Text to append", type: "textarea" },
      ],
      toolName: "docs.append_text",
    },
  ],
  "google-drive": [
    {
      label: "Create file",
      params: [
        { key: "name", label: "File name", placeholder: "release-summary.txt" },
        { key: "content", label: "Content", placeholder: "File content", type: "textarea" },
      ],
      toolName: "drive.create_file",
    },
  ],
  "google-sheets": [
    {
      label: "Update range",
      params: [
        { key: "spreadsheetId", label: "Spreadsheet ID", placeholder: "Google Sheets ID" },
        { key: "range", label: "Range", placeholder: "Sheet1!A1:B2" },
        { key: "values", label: "Values JSON", placeholder: "[[\"Status\", \"Done\"]]", type: "textarea" },
      ],
      toolName: "sheets.update",
    },
  ],
  linear: [
    {
      label: "Create issue",
      params: [
        { key: "teamId", label: "Team ID", placeholder: "Linear team ID" },
        { key: "title", label: "Title", placeholder: "Release follow-up" },
        { key: "description", label: "Description", placeholder: "Issue details", type: "textarea" },
      ],
      toolName: "linear.create_issue",
    },
  ],
  notion: [
    {
      label: "Create page",
      params: [
        { key: "parentId", label: "Parent page/database ID", placeholder: "Notion parent ID" },
        { key: "title", label: "Title", placeholder: "Release notes" },
        { key: "content", label: "Content", placeholder: "Page content", type: "textarea" },
      ],
      toolName: "notion.create_page",
    },
  ],
  obsidian: [
    {
      label: "Create note",
      params: [
        { key: "path", label: "Note path", placeholder: "Inbox/release.md" },
        { key: "content", label: "Content", placeholder: "Markdown content", type: "textarea" },
      ],
      toolName: "obsidian.create_note",
    },
  ],
  slack: [
    {
      label: "Send message",
      params: [
        { key: "channel", label: "Channel", placeholder: "#releases or C0123456789" },
        { key: "text", label: "Message", placeholder: "A release event happened.", type: "textarea" },
      ],
      toolName: "slack.send_message",
    },
  ],
  vercel: [
    {
      label: "Create deployment",
      params: [
        { key: "projectId", label: "Project ID", placeholder: "Vercel project ID" },
        { key: "target", label: "Target", placeholder: "preview or production" },
      ],
      toolName: "vercel.create_deployment",
    },
  ],
  zapier: [
    {
      label: "Trigger Zap",
      params: [
        { key: "zapId", label: "Zap ID", placeholder: "Zapier Zap ID" },
        { key: "payload", label: "Payload JSON", placeholder: "{\"text\":\"Release ready\"}", type: "textarea" },
      ],
      toolName: "zapier.trigger_zap",
    },
  ],
};

const defaultAction: WorkflowActionDraft = {
  connectorId: "slack",
  params: { channel: "#releases", text: "A release event happened." },
  toolName: "slack.send_message",
};

const operatorOptions: Array<{ label: string; value: ConditionOperator }> = [
  { label: "equals", value: "equals" },
  { label: "contains", value: "contains" },
  { label: "starts with", value: "starts_with" },
  { label: "does not equal", value: "not_equals" },
  { label: "exists", value: "exists" },
  { label: "does not exist", value: "not_exists" },
];

const emptyDraft = {
  actions: [defaultAction],
  actionsJson: JSON.stringify([defaultAction], null, 2),
  conditions: [] as TriggerConditionDraft[],
  enabled: false,
  name: "",
  triggerConnectorId: "github" as IntegrationConnectorId,
  triggerEventType: "pull_request.merged",
  triggerFilterJson: "{}",
  useAdvancedActions: false,
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function connectorOptions(settings: IntegrationSettingsResponse | null) {
  if (!settings) {
    return Object.keys(connectorLabels).map((connectorId) => ({
      connectorId: connectorId as IntegrationConnectorId,
      connected: false,
      label: connectorLabels[connectorId as IntegrationConnectorId],
    }));
  }
  const connected = new Set(
    settings.connections
      .filter((connection) => connection.status === "CONNECTED")
      .map((connection) => connection.connectorId),
  );
  return settings.connectors.map((connector) => ({
    connectorId: connector.connectorId,
    connected: connected.has(connector.connectorId),
    label: connector.displayName,
  }));
}

function normalizeParams(action: WorkflowActionDraft): Record<string, unknown> {
  const definition = actionCatalog[action.connectorId]?.find((item) => item.toolName === action.toolName);
  const params: Record<string, unknown> = {};
  for (const param of definition?.params ?? []) {
    const value = action.params[param.key]?.trim();
    if (!value) continue;
    if (param.placeholder.includes("JSON")) {
      params[param.key] = parseJson(value, value);
    } else {
      params[param.key] = value;
    }
  }
  return params;
}

function toWorkflowActions(actions: WorkflowActionDraft[]): WorkflowActionDefinition[] {
  return actions.map((action) => ({
    connectorId: action.connectorId,
    params: normalizeParams(action),
    toolName: action.toolName,
  }));
}

function conditionsToFilter(conditions: TriggerConditionDraft[]) {
  const normalized = conditions
    .filter((condition) => condition.field && (condition.value.trim() || condition.operator === "exists" || condition.operator === "not_exists"))
    .map((condition, index) => ({
      combinator: index === 0 ? "AND" : condition.combinator,
      field: condition.field,
      operator: condition.operator,
      value: condition.operator === "exists" || condition.operator === "not_exists" ? null : condition.value,
    }));
  return normalized.length ? { conditions: normalized } : {};
}

function firstFieldForEvent(eventType: string) {
  return triggerFieldCatalog[eventType]?.[0]?.value ?? defaultTriggerFields[0]?.value ?? "id";
}

function defaultCondition(eventType: string): TriggerConditionDraft {
  return {
    combinator: "AND",
    field: firstFieldForEvent(eventType),
    operator: "equals",
    value: "",
  };
}

function actionWithDefaultTool(connectorId: IntegrationConnectorId): WorkflowActionDraft {
  const fallbackAction = actionCatalog.slack[0];
  if (!fallbackAction) {
    throw new Error("Workflow action catalog is empty.");
  }
  const first = actionCatalog[connectorId][0] ?? fallbackAction;
  return {
    connectorId,
    params: Object.fromEntries(first.params.map((param) => [param.key, ""])),
    toolName: first.toolName,
  };
}

export function WorkflowsSettings() {
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  const connectors = useMemo(() => connectorOptions(integrations), [integrations]);
  const triggerEventOptions = triggerEvents[draft.triggerConnectorId] ?? [];

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listWorkflows(),
      getIntegrationSettings().catch(() => null),
    ])
      .then(([items, integrationSettings]) => {
        if (cancelled) return;
        setWorkflows(items);
        setIntegrations(integrationSettings);
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

  function syncActions(actions: WorkflowActionDraft[], useAdvancedActions = draft.useAdvancedActions) {
    setDraft((current) => ({
      ...current,
      actions,
      actionsJson: JSON.stringify(toWorkflowActions(actions), null, 2),
      useAdvancedActions,
    }));
  }

  async function saveWorkflow() {
    setSaving(true);
    setStatus(null);
    try {
      const input: WorkflowInput = {
        actions: draft.useAdvancedActions
          ? parseJson(draft.actionsJson, toWorkflowActions(draft.actions))
          : toWorkflowActions(draft.actions),
        enabled: draft.enabled,
        name: draft.name.trim(),
        triggerConnectorId: draft.triggerConnectorId,
        triggerEventType: draft.triggerEventType,
        triggerFilter: draft.triggerFilterJson.trim() && draft.triggerFilterJson.trim() !== "{}"
          ? parseJson(draft.triggerFilterJson, conditionsToFilter(draft.conditions))
          : conditionsToFilter(draft.conditions),
      };
      const workflow = await createWorkflow(input);
      setWorkflows((current) => [workflow, ...current]);
      setDraft(emptyDraft);
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

  function updateAction(index: number, next: WorkflowActionDraft) {
    const actions = draft.actions.map((action, currentIndex) => (currentIndex === index ? next : action));
    syncActions(actions, false);
  }

  function addAction() {
    syncActions([...draft.actions, defaultAction], false);
  }

  function removeAction(index: number) {
    syncActions(draft.actions.filter((_, currentIndex) => currentIndex !== index), false);
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

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
              Trigger connector
              <select
                aria-label="Workflow trigger connector"
                className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => {
                  const connectorId = event.target.value as IntegrationConnectorId;
                  setDraft((current) => ({
                    ...current,
                    conditions: [],
                    triggerConnectorId: connectorId,
                    triggerEventType: triggerEvents[connectorId]?.[0]?.value ?? current.triggerEventType,
                    triggerFilterJson: "{}",
                  }));
                }}
                value={draft.triggerConnectorId}
              >
                {connectors.map((connector) => (
                  <option key={connector.connectorId} value={connector.connectorId}>
                    {connector.label}{connector.connected ? " (connected)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary sm:col-span-2">
              Trigger event
              <select
                aria-label="Workflow trigger event"
                className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, conditions: [], triggerEventType: event.target.value, triggerFilterJson: "{}" }))}
                value={draft.triggerEventType}
              >
                {triggerEventOptions.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-medium text-text-secondary">Trigger conditions</div>
                <div className="mt-0.5 text-[11px] text-text-tertiary">Empty conditions fire on all events.</div>
              </div>
              <PillButton
                className="gap-1.5"
                onClick={() => setDraft((current) => ({
                  ...current,
                  conditions: [...current.conditions, defaultCondition(current.triggerEventType)],
                  triggerFilterJson: "{}",
                }))}
                type="button"
                variant="secondary"
              >
                <Plus className="h-3.5 w-3.5" />
                Add condition
              </PillButton>
            </div>
            {draft.conditions.length === 0 ? (
              <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-[12px] text-text-tertiary">
                No conditions. This workflow will run for every {draft.triggerEventType} event.
              </div>
            ) : null}
            {draft.conditions.map((condition, index) => {
              const fields = triggerFieldCatalog[draft.triggerEventType] ?? defaultTriggerFields;
              const selectedField = fields.find((field) => field.value === condition.field) ?? fields[0];
              const valueType = selectedField?.type === "number" ? "number" : selectedField?.type === "boolean" ? "text" : "text";
              return (
                <div className="grid gap-2 rounded-md border border-border-subtle bg-bg-surface p-2 sm:grid-cols-[88px_1fr_140px_1fr_auto]" key={`${condition.field}-${index}`}>
                  <select
                    aria-label={`Workflow condition ${index + 1} combinator`}
                    className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-2 text-[12px] text-text-primary outline-none"
                    disabled={index === 0}
                    onChange={(event) => {
                      const conditions = draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, combinator: event.target.value as ConditionCombinator } : item);
                      setDraft((current) => ({ ...current, conditions, triggerFilterJson: "{}" }));
                    }}
                    value={index === 0 ? "AND" : condition.combinator}
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                  <select
                    aria-label={`Workflow condition ${index + 1} field`}
                    className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-2 text-[12px] text-text-primary outline-none"
                    onChange={(event) => {
                      const conditions = draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item);
                      setDraft((current) => ({ ...current, conditions, triggerFilterJson: "{}" }));
                    }}
                    value={condition.field}
                  >
                    {fields.map((field) => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Workflow condition ${index + 1} operator`}
                    className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-2 text-[12px] text-text-primary outline-none"
                    onChange={(event) => {
                      const conditions = draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value as ConditionOperator } : item);
                      setDraft((current) => ({ ...current, conditions, triggerFilterJson: "{}" }));
                    }}
                    value={condition.operator}
                  >
                    {operatorOptions.map((operator) => (
                      <option key={operator.value} value={operator.value}>{operator.label}</option>
                    ))}
                  </select>
                  <input
                    aria-label={`Workflow condition ${index + 1} value`}
                    className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-2 text-[12px] text-text-primary outline-none disabled:opacity-50"
                    disabled={condition.operator === "exists" || condition.operator === "not_exists"}
                    onChange={(event) => {
                      const conditions = draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item);
                      setDraft((current) => ({ ...current, conditions, triggerFilterJson: "{}" }));
                    }}
                    placeholder={selectedField?.type === "boolean" ? "true or false" : "Value"}
                    type={valueType}
                    value={condition.value}
                  />
                  <button
                    aria-label={`Remove workflow condition ${index + 1}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-text-tertiary hover:text-status-error"
                    onClick={() => setDraft((current) => ({ ...current, conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index), triggerFilterJson: "{}" }))}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <details className="rounded-md border border-border-subtle bg-bg-surface p-2">
              <summary className="cursor-pointer text-[11.5px] font-medium text-text-secondary">Advanced JSON fallback</summary>
              <textarea
                aria-label="Workflow trigger filter JSON"
                className="mt-2 min-h-[72px] w-full rounded-md border border-border-subtle bg-bg-canvas p-3 font-mono text-[12px] text-text-primary outline-none"
                onChange={(event) => setDraft((current) => ({ ...current, triggerFilterJson: event.target.value }))}
                value={draft.triggerFilterJson}
              />
            </details>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11.5px] font-medium text-text-secondary">Actions</div>
              <PillButton className="gap-1.5" onClick={addAction} type="button" variant="secondary">
                <Plus className="h-3.5 w-3.5" />
                Add action
              </PillButton>
            </div>
            {draft.actions.map((action, index) => {
              const actionsForConnector = actionCatalog[action.connectorId] ?? [];
              const definition = actionsForConnector.find((item) => item.toolName === action.toolName) ?? actionsForConnector[0];
              return (
                <div className="rounded-[10px] border border-border-subtle bg-bg-canvas p-3" key={`${action.connectorId}-${index}`}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
                      Connector
                      <select
                        aria-label={`Workflow action ${index + 1} connector`}
                        className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
                        onChange={(event) => updateAction(index, actionWithDefaultTool(event.target.value as IntegrationConnectorId))}
                        value={action.connectorId}
                      >
                        {connectors.map((connector) => (
                          <option key={connector.connectorId} value={connector.connectorId}>
                            {connector.label}{connector.connected ? " (connected)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
                      Action
                      <select
                        aria-label={`Workflow action ${index + 1} tool`}
                        className="h-9 rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none"
                        onChange={(event) => {
                          const nextTool = actionsForConnector.find((item) => item.toolName === event.target.value) ?? actionsForConnector[0] ?? actionCatalog.slack[0];
                          if (!nextTool) return;
                          updateAction(index, {
                            ...action,
                            params: Object.fromEntries(nextTool.params.map((param) => [param.key, action.params[param.key] ?? ""])),
                            toolName: nextTool.toolName,
                          });
                        }}
                        value={action.toolName}
                      >
                        {actionsForConnector.map((item) => (
                          <option key={item.toolName} value={item.toolName}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      aria-label={`Remove workflow action ${index + 1}`}
                      className="mt-5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-text-tertiary hover:text-status-error"
                      disabled={draft.actions.length === 1}
                      onClick={() => removeAction(index)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {definition?.params.map((param) => {
                      if (action.connectorId === "slack" && param.key === "channel") {
                        return (
                          <SlackChannelPicker
                            key={param.key}
                            label={`Workflow action ${index + 1} Slack channel`}
                            onChange={(value) => {
                              updateAction(index, {
                                ...action,
                                params: { ...action.params, [param.key]: value },
                              });
                            }}
                            value={action.params[param.key] ?? ""}
                          />
                        );
                      }
                      const Component = param.type === "textarea" ? "textarea" : "input";
                      return (
                        <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary" key={param.key}>
                          {param.label}
                          <Component
                            aria-label={`Workflow action ${index + 1} ${param.label}`}
                            className={cn(
                              "rounded-md border border-border-subtle bg-bg-surface px-3 text-[12.5px] text-text-primary outline-none",
                              param.type === "textarea" ? "min-h-[76px] py-2" : "h-9",
                            )}
                            onChange={(event) => {
                              updateAction(index, {
                                ...action,
                                params: { ...action.params, [param.key]: event.target.value },
                              });
                            }}
                            placeholder={param.placeholder}
                            value={action.params[param.key] ?? ""}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <details className="rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
            <summary className="cursor-pointer text-[11.5px] font-medium text-text-secondary">
              Advanced JSON fallback
            </summary>
            <textarea
              aria-label="Workflow actions JSON"
              className="mt-3 min-h-[120px] w-full rounded-md border border-border-subtle bg-bg-surface p-3 font-mono text-[12px] text-text-primary outline-none"
              onChange={(event) => setDraft((current) => ({ ...current, actionsJson: event.target.value, useAdvancedActions: true }))}
              value={draft.actionsJson}
            />
            <p className="m-0 mt-2 text-[11.5px] text-text-tertiary">
              Editing this JSON switches this workflow to advanced action input for the next save.
            </p>
          </details>

          <div className="flex flex-wrap items-center gap-3">
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
                {connectorLabels[workflow.triggerConnectorId as IntegrationConnectorId] ?? workflow.triggerConnectorId} · {workflow.triggerEventType} · {workflow.actions.length} action(s)
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
