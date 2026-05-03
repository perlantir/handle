"use client";

import type { MemoryScope } from "@handle/shared";
import { Brain, Circle, KeyRound, Loader2, Play, RotateCcw, Save, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { PillButton } from "@/components/design-system";
import {
  getMemorySettings,
  resetMemory,
  saveMemoryCloudKey,
  startSelfHostedMemory,
  stopSelfHostedMemory,
  updateMemorySettings,
  type MemoryProviderMode,
  type MemorySettings as MemorySettingsState,
} from "@/lib/settingsMemory";
import { cn } from "@/lib/utils";

type StatusState = { message: string; tone: "error" | "success" };

const memoryScopeOptions: Array<{ label: string; value: MemoryScope }> = [
  { label: "Global + project", value: "GLOBAL_AND_PROJECT" },
  { label: "Project only", value: "PROJECT_ONLY" },
  { label: "None", value: "NONE" },
];

function RadioCard({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-[12px] border bg-bg-canvas px-4 py-3 transition-colors duration-fast",
        checked
          ? "border-accent/40 bg-accent/5"
          : "border-border-subtle hover:bg-bg-subtle",
      )}
    >
      <input
        checked={checked}
        className="mt-0.5"
        onChange={onChange}
        type="radio"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-text-primary">
          {label}
        </span>
        <span className="mt-1 block text-[11.5px] leading-[17px] text-text-tertiary">
          {description}
        </span>
      </span>
    </label>
  );
}

export function MemorySettings() {
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [draftCloudBaseURL, setDraftCloudBaseURL] = useState("https://api.getzep.com");
  const [draftProvider, setDraftProvider] = useState<MemoryProviderMode>("self-hosted");
  const [draftScope, setDraftScope] = useState<MemoryScope>("GLOBAL_AND_PROJECT");
  const [draftSelfHostedBaseURL, setDraftSelfHostedBaseURL] = useState("http://127.0.0.1:8000");
  const [loading, setLoading] = useState(true);
  const [memory, setMemory] = useState<MemorySettingsState | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [working, setWorking] = useState<"key" | "reset" | "start" | "stop" | null>(null);

  useEffect(() => {
    let mounted = true;
    getMemorySettings()
      .then((nextSettings) => {
        if (!mounted) return;
        applySettings(nextSettings);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setStatus({
          message: error instanceof Error ? error.message : "Failed to load memory settings",
          tone: "error",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function applySettings(nextSettings: MemorySettingsState) {
    setMemory(nextSettings);
    setDraftCloudBaseURL(nextSettings.cloudBaseURL);
    setDraftProvider(nextSettings.provider);
    setDraftScope(nextSettings.defaultScopeForNewProjects);
    setDraftSelfHostedBaseURL(nextSettings.selfHostedBaseURL);
  }

  async function refresh() {
    const nextSettings = await getMemorySettings();
    applySettings(nextSettings);
    return nextSettings;
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const nextSettings = await updateMemorySettings({
        cloudBaseURL: draftCloudBaseURL,
        defaultScopeForNewProjects: draftScope,
        provider: draftProvider,
        selfHostedBaseURL: draftSelfHostedBaseURL,
      });
      applySettings(nextSettings);
      setStatus({ message: "Memory settings saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save memory settings",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCloudKeySave() {
    if (!cloudApiKey.trim()) return;
    setWorking("key");
    setStatus(null);
    try {
      await saveMemoryCloudKey(cloudApiKey.trim());
      setCloudApiKey("");
      await refresh();
      setStatus({ message: "Zep Cloud key saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save Zep Cloud key",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleStart() {
    setWorking("start");
    setStatus(null);
    try {
      await startSelfHostedMemory();
      await refresh();
      setStatus({ message: "Self-hosted memory started", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to start memory",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleStop() {
    setWorking("stop");
    setStatus(null);
    try {
      await stopSelfHostedMemory();
      await refresh();
      setStatus({ message: "Self-hosted memory stopped", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to stop memory",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleReset() {
    setWorking("reset");
    setStatus(null);
    try {
      const result = await resetMemory("delete");
      setResetConfirmation("");
      await refresh();
      setStatus({ message: `Memory reset (${result.deleted} namespaces cleared)`, tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to reset memory",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading memory settings
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
              Memory provider
            </h2>
            <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
              Handle uses self-hosted Zep by default and can switch to Zep Cloud.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-[999px] border border-border-subtle bg-bg-canvas px-3 py-1.5 text-[11.5px] text-text-secondary">
            <Circle
              className={cn(
                "h-2.5 w-2.5 fill-current",
                memory?.status.status === "online" ? "text-status-success" : "text-status-error",
              )}
            />
            {memory?.status.status === "online" ? "Connected" : "Offline"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard
            checked={draftProvider === "self-hosted"}
            description="Local Docker Compose stack on this Mac."
            label="Self-hosted"
            onChange={() => setDraftProvider("self-hosted")}
          />
          <RadioCard
            checked={draftProvider === "cloud"}
            description="Zep Cloud with an API key stored server-side."
            label="Cloud"
            onChange={() => setDraftProvider("cloud")}
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Self-hosted URL</span>
            <input
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 font-mono text-[12px] text-text-primary outline-none"
              onChange={(event) => setDraftSelfHostedBaseURL(event.target.value)}
              value={draftSelfHostedBaseURL}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <PillButton
              disabled={working !== null}
              icon={working === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              onClick={handleStart}
              type="button"
            >
              Start self-hosted
            </PillButton>
            <PillButton
              disabled={working !== null}
              icon={working === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              onClick={handleStop}
              type="button"
              variant="secondary"
            >
              Stop self-hosted
            </PillButton>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Cloud URL</span>
            <input
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 font-mono text-[12px] text-text-primary outline-none"
              onChange={(event) => setDraftCloudBaseURL(event.target.value)}
              value={draftCloudBaseURL}
            />
          </label>
          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Cloud API key</span>
            <div className="flex gap-2">
              <input
                aria-label="Zep Cloud API key"
                className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => setCloudApiKey(event.target.value)}
                placeholder={memory?.hasCloudApiKey ? "Saved" : "Paste API key"}
                type="password"
                value={cloudApiKey}
              />
              <PillButton
                disabled={!cloudApiKey.trim() || working !== null}
                icon={working === "key" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                onClick={handleCloudKeySave}
                type="button"
              >
                Save key
              </PillButton>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Default scope for new projects</span>
            <select
              className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
              onChange={(event) => setDraftScope(event.target.value as MemoryScope)}
              value={draftScope}
            >
              {memoryScopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">Reset memory</span>
            <div className="flex gap-2">
              <input
                aria-label="Reset memory confirmation"
                className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder="Type delete"
                value={resetConfirmation}
              />
              <PillButton
                disabled={resetConfirmation !== "delete" || working !== null}
                icon={working === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                onClick={handleReset}
                type="button"
                variant="secondary"
              >
                Reset
              </PillButton>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        {status ? (
          <span
            className={cn(
              "text-[12px]",
              status.tone === "success" ? "text-status-success" : "text-status-error",
            )}
          >
            {status.message}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-[12px] text-text-tertiary">
            <Brain className="h-3.5 w-3.5" />
            {memory?.status.detail ?? "Memory settings are ready."}
          </span>
        )}
        <PillButton
          disabled={saving}
          icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          onClick={handleSave}
          type="button"
        >
          Save
        </PillButton>
      </div>
    </div>
  );
}
