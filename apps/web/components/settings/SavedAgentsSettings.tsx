"use client";

import { Check, Loader2, Play, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { MemoryScope, SavedAgentSummary } from "@handle/shared";
import { PillButton } from "@/components/design-system";
import { cn } from "@/lib/utils";
import {
  createSavedAgent,
  deleteSavedAgent,
  listSavedAgents,
  runSavedAgent,
} from "@/lib/savedAgents";

export function SavedAgentsSettings() {
  const [agents, setAgents] = useState<SavedAgentSummary[]>([]);
  const [connectorAccess, setConnectorAccess] = useState(
    "gmail,slack,notion,github",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryScope, setMemoryScope] = useState<MemoryScope>("NONE");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(
    "Read inbox, summarize urgent emails, and post the summary to Slack #updates.",
  );
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedAgents()
      .then((items) => {
        if (!cancelled) setAgents(items);
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

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const agent = await createSavedAgent({
        connectorAccess: connectorAccess
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        enabled: true,
        memoryScope,
        name: name.trim(),
        outputTarget: { type: "chat" },
        prompt,
        trigger: "manual",
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
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              aria-label="Saved agent connector access"
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setConnectorAccess(event.target.value)}
              value={connectorAccess}
            />
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
          </div>
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
                {agent.memoryScope}
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
