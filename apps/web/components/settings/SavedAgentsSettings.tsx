"use client";

import { Check, Loader2, Play, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  IntegrationConnectorId,
  IntegrationSettingsResponse,
  MemoryScope,
  SavedAgentSummary,
} from "@handle/shared";
import { PillButton } from "@/components/design-system";
import { FrequencyBuilder } from "./FrequencyBuilder";
import { SlackChannelPicker } from "./SlackChannelPicker";
import { getIntegrationSettings } from "@/lib/settingsIntegrations";
import { cn } from "@/lib/utils";
import {
  createSavedAgent,
  deleteSavedAgent,
  listSavedAgents,
  runSavedAgent,
} from "@/lib/savedAgents";

type OutputTarget = "chat" | "email" | "notion" | "slack";
type TriggerMode = "manual" | "schedule";

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

const fallbackConnectors = Object.keys(connectorLabels) as IntegrationConnectorId[];

const promptTemplates = [
  {
    label: "Daily inbox digest",
    prompt: "Every @today, read @inbox, summarize urgent emails, and send me a concise digest with suggested replies.",
  },
  {
    label: "Weekly competitor research",
    prompt: "Every @last_week, research competitor updates, cite sources, and post a short summary to the selected output target.",
  },
  {
    label: "PR review summary",
    prompt: "Review new GitHub pull requests from @selected_repositories, summarize risk, and draft follow-up issues for anything high severity.",
  },
  {
    label: "Project status report",
    prompt: "Summarize project activity from @last_week across connected tools and produce a status report with blockers, wins, and next actions.",
  },
];

const variableTokens = ["@today", "@yesterday", "@last_week", "@inbox", "@selected_channels", "@selected_repositories"];

const connectorCapabilities: Partial<Record<IntegrationConnectorId, string[]>> = {
  gmail: ["read inbox", "search messages", "draft emails", "send with approval"],
  github: ["list issues", "read pull requests", "summarize code changes", "comment with approval"],
  notion: ["search pages", "read databases", "create pages with approval"],
  slack: ["read channels", "search messages", "post with approval"],
};

function resolvedPromptPreview(prompt: string) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return prompt
    .replaceAll("@today", today.toLocaleDateString())
    .replaceAll("@yesterday", yesterday.toLocaleDateString())
    .replaceAll("@last_week", "the last 7 days")
    .replaceAll("@inbox", "Gmail inbox")
    .replaceAll("@selected_channels", "selected Slack channels")
    .replaceAll("@selected_repositories", "selected GitHub repositories");
}

function connectorOptions(settings: IntegrationSettingsResponse | null) {
  if (!settings) {
    return fallbackConnectors.map((connectorId) => ({
      connectorId,
      connected: false,
      label: connectorLabels[connectorId],
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

function outputTargetPayload({
  email,
  notionPageId,
  outputTarget,
  slackChannel,
}: {
  email: string;
  notionPageId: string;
  outputTarget: OutputTarget;
  slackChannel: string;
}) {
  if (outputTarget === "slack") return { channel: slackChannel.trim(), type: "slack" };
  if (outputTarget === "notion") return { pageId: notionPageId.trim(), type: "notion" };
  if (outputTarget === "email") return { recipient: email.trim(), type: "email" };
  return { type: "chat" };
}

export function SavedAgentsSettings() {
  const [agents, setAgents] = useState<SavedAgentSummary[]>([]);
  const [connectorAccess, setConnectorAccess] = useState<IntegrationConnectorId[]>([
    "gmail",
    "slack",
    "notion",
    "github",
  ]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryScope, setMemoryScope] = useState<MemoryScope>("NONE");
  const [name, setName] = useState("");
  const [notionPageId, setNotionPageId] = useState("");
  const [outputTarget, setOutputTarget] = useState<OutputTarget>("chat");
  const [prompt, setPrompt] = useState(
    "Read inbox, summarize urgent emails, and post the summary to Slack #updates.",
  );
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState("0 9 * * 1-5");
  const [slackChannel, setSlackChannel] = useState("#updates");
  const [status, setStatus] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const [trigger, setTrigger] = useState<TriggerMode>("manual");

  const connectors = useMemo(() => connectorOptions(integrations), [integrations]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listSavedAgents(),
      getIntegrationSettings().catch(() => null),
    ])
      .then(([items, integrationSettings]) => {
        if (cancelled) return;
        setAgents(items);
        setIntegrations(integrationSettings);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load saved agents",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleConnector(connectorId: IntegrationConnectorId) {
    setConnectorAccess((current) =>
      current.includes(connectorId)
        ? current.filter((item) => item !== connectorId)
        : [...current, connectorId],
    );
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const agent = await createSavedAgent({
        connectorAccess,
        enabled: true,
        memoryScope,
        name: name.trim(),
        outputTarget: outputTargetPayload({
          email,
          notionPageId,
          outputTarget,
          slackChannel,
        }),
        prompt,
        schedule: trigger === "schedule" ? schedule.trim() : null,
        trigger,
      });
      setAgents((current) => [agent, ...current]);
      setName("");
      setStatus({ message: "Saved agent created", tone: "success" });
    } catch (err) {
      setStatus({
        message:
          err instanceof Error ? err.message : "Could not create saved agent",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function run(agent: SavedAgentSummary) {
    setRunning(agent.id);
    setStatus(null);
    try {
      const result = await runSavedAgent(agent.id);
      setStatus({
        message: `Saved agent queued · ${result.agentRunId}`,
        tone: "success",
      });
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Run failed",
        tone: "error",
      });
    } finally {
      setRunning(null);
    }
  }

  async function remove(agent: SavedAgentSummary) {
    await deleteSavedAgent(agent.id);
    setAgents((current) => current.filter((item) => item.id !== agent.id));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading saved agents
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
        <h2 className="m-0 text-[13px] font-medium text-text-primary">
          New saved agent
        </h2>
        <div className="mt-3 grid gap-3">
          <input
            aria-label="Saved agent name"
            className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => setName(event.target.value)}
            placeholder="Urgent email digest"
            value={name}
          />
          <textarea
            aria-label="Saved agent prompt"
            className="min-h-[96px] rounded-md border border-border-subtle bg-bg-canvas p-3 text-[12.5px] text-text-primary outline-none"
            onChange={(event) => setPrompt(event.target.value)}
            value={prompt}
          />

          <section className="grid gap-3 rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
            <div>
              <div className="text-[11.5px] font-medium text-text-secondary">Prompt starters</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {promptTemplates.map((template) => (
                  <button
                    className="rounded-pill border border-border-subtle bg-bg-surface px-2.5 py-1 text-[11.5px] text-text-secondary hover:border-accent hover:text-accent"
                    key={template.label}
                    onClick={() => setPrompt(template.prompt)}
                    type="button"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] font-medium text-text-secondary">Insert variable</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {variableTokens.map((token) => (
                  <button
                    className="rounded-pill border border-border-subtle bg-bg-surface px-2.5 py-1 font-mono text-[11px] text-text-secondary hover:border-accent hover:text-accent"
                    key={token}
                    onClick={() => setPrompt((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${token}`)}
                    type="button"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
              <div className="text-[11.5px] font-medium text-text-secondary">Available connector capabilities</div>
              <div className="mt-2 grid gap-1 text-[11.5px] text-text-tertiary">
                {connectorAccess.map((connectorId) => (
                  <div key={connectorId}>
                    <span className="font-medium text-text-secondary">{connectorLabels[connectorId]}:</span>{" "}
                    {(connectorCapabilities[connectorId] ?? ["read connected data", "act with approval"]).join(", ")}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
              <div className="text-[11.5px] font-medium text-text-secondary">Resolved prompt preview</div>
              <p className="m-0 mt-1 whitespace-pre-wrap text-[12px] leading-5 text-text-tertiary">
                {resolvedPromptPreview(prompt)}
              </p>
            </div>
          </section>

          <section className="rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
            <div className="text-[11.5px] font-medium text-text-secondary">
              Connector access
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {connectors.map((connector) => (
                <label
                  className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-[12px] text-text-secondary"
                  key={connector.connectorId}
                >
                  <input
                    aria-label={`Saved agent connector ${connector.label}`}
                    checked={connectorAccess.includes(connector.connectorId)}
                    onChange={() => toggleConnector(connector.connectorId)}
                    type="checkbox"
                  />
                  <span>{connector.label}</span>
                  {connector.connected ? (
                    <span className="ml-auto rounded-pill bg-status-success/10 px-2 py-0.5 text-[10.5px] font-medium text-status-success">
                      connected
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="rounded-[10px] border border-border-subtle bg-bg-canvas p-3">
              <legend className="px-1 text-[11.5px] font-medium text-text-secondary">
                Trigger
              </legend>
              <div className="mt-1 flex gap-2">
                {(["manual", "schedule"] as TriggerMode[]).map((mode) => (
                  <label
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px]",
                      trigger === mode
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border-subtle bg-bg-surface text-text-secondary",
                    )}
                    key={mode}
                  >
                    <input
                      checked={trigger === mode}
                      className="sr-only"
                      name="saved-agent-trigger"
                      onChange={() => setTrigger(mode)}
                      type="radio"
                    />
                    {mode === "manual" ? "Manual" : "Scheduled"}
                  </label>
                ))}
              </div>
              {trigger === "schedule" ? (
                <div className="mt-3">
                  <FrequencyBuilder label="Saved agent schedule" onChange={setSchedule} value={schedule} />
                </div>
              ) : null}
            </fieldset>

            <div className="grid gap-3">
              <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
                Output target
                <select
                  aria-label="Saved agent output target"
                  className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  onChange={(event) => setOutputTarget(event.target.value as OutputTarget)}
                  value={outputTarget}
                >
                  <option value="chat">Chat</option>
                  <option value="slack">Slack channel</option>
                  <option value="notion">Notion page</option>
                  <option value="email">Email</option>
                </select>
              </label>
              {outputTarget === "slack" ? (
                <SlackChannelPicker
                  label="Saved agent Slack output channel"
                  onChange={setSlackChannel}
                  value={slackChannel}
                />
              ) : null}
              {outputTarget === "notion" ? (
                <input
                  aria-label="Saved agent Notion output page"
                  className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  onChange={(event) => setNotionPageId(event.target.value)}
                  placeholder="Notion page ID"
                  value={notionPageId}
                />
              ) : null}
              {outputTarget === "email" ? (
                <input
                  aria-label="Saved agent email output recipient"
                  className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  value={email}
                />
              ) : null}
            </div>
          </div>

          <label className="grid gap-1 text-[11.5px] font-medium text-text-secondary">
            Memory
            <select
              aria-label="Saved agent memory scope"
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) =>
                setMemoryScope(event.target.value as MemoryScope)
              }
              value={memoryScope}
            >
              <option value="NONE">Memory off</option>
              <option value="PROJECT_ONLY">Project</option>
              <option value="GLOBAL_AND_PROJECT">Global + Project</option>
            </select>
          </label>

          <div className="flex items-center gap-3">
            <PillButton
              disabled={saving || !name.trim()}
              onClick={save}
              variant="primary"
            >
              {saving ? "Saving" : "Save agent"}
            </PillButton>
            {status ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium",
                  status.tone === "success"
                    ? "bg-status-success/10 text-status-success"
                    : "bg-status-error/10 text-status-error",
                )}
              >
                {status.tone === "success" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {status.message}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {agents.map((agent) => (
        <section
          className="rounded-[14px] border border-border-subtle bg-bg-surface p-4"
          key={agent.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[13px] font-medium text-text-primary">
                {agent.name}
              </h2>
              <p className="m-0 mt-1 text-[11.5px] text-text-tertiary">
                {agent.connectorAccess.join(", ") || "No connectors"} ·{" "}
                {agent.trigger === "schedule" ? agent.schedule ?? "Scheduled" : "Manual"} · {agent.memoryScope}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PillButton
              className="gap-1.5"
              disabled={running === agent.id}
              onClick={() => run(agent)}
              variant="secondary"
            >
              <Play className="h-3.5 w-3.5" />
              {running === agent.id ? "Running" : "Run now"}
            </PillButton>
            <button
              aria-label={`Delete ${agent.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-tertiary hover:text-status-error"
              onClick={() => void remove(agent)}
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
