"use client";

import { ExternalLink, FolderOpen, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { PillButton } from "@/components/design-system";
import {
  getExecutionSettings,
  openWorkspaceFolder,
  updateExecutionSettings,
  type ExecutionBackend,
  type ExecutionSettings as ExecutionSettingsState,
} from "@/lib/settingsExecution";
import { cn } from "@/lib/utils";

interface StatusState {
  message: string;
  tone: "error" | "success";
}

const cleanupOptions = [
  { disabled: false, label: "Keep all", value: "keep-all" },
  {
    disabled: true,
    label: "Delete after 7 days (Phase 11)",
    value: "delete-7-days",
  },
  {
    disabled: true,
    label: "Delete after 30 days (Phase 11)",
    value: "delete-30-days",
  },
  { disabled: true, label: "Never (Phase 11)", value: "never" },
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

export function ExecutionSettings() {
  const [draftBackend, setDraftBackend] = useState<ExecutionBackend>("e2b");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ExecutionSettingsState | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);

  useEffect(() => {
    let mounted = true;

    getExecutionSettings()
      .then((nextSettings) => {
        if (!mounted) return;
        setSettings(nextSettings);
        setDraftBackend(nextSettings.defaultBackend);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setStatus({
          message: error instanceof Error ? error.message : "Failed to load execution settings",
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

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    try {
      const nextSettings = await updateExecutionSettings({
        cleanupPolicy: "keep-all",
        defaultBackend: draftBackend,
      });
      setSettings(nextSettings);
      setStatus({ message: "Execution settings saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save execution settings",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenWorkspace() {
    setOpening(true);
    setStatus(null);

    try {
      const result = await openWorkspaceFolder();
      setStatus({
        message: result.opened
          ? "Workspace opened in Finder"
          : "Workspace folder did not open",
        tone: result.opened ? "success" : "error",
      });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to open workspace folder",
        tone: "error",
      });
    } finally {
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading execution settings
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="mb-4">
          <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
            Default backend
          </h2>
          <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
            New tasks use this runtime unless the composer chooses a per-task
            override.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard
            checked={draftBackend === "e2b"}
            description="Cloud sandbox runtime for isolated shell, files, and browser tools."
            label="E2B Cloud"
            onChange={() => setDraftBackend("e2b")}
          />
          <RadioCard
            checked={draftBackend === "local"}
            description="Run file and shell tools on this Mac with SafetyGovernor approvals."
            label="Local Mac"
            onChange={() => setDraftBackend("local")}
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <div>
            <label
              className="text-[12.5px] font-medium text-text-secondary"
              htmlFor="execution-workspace-base-dir"
            >
              Workspace base directory
            </label>
            <div
              className="mt-2 rounded-md border border-border-subtle bg-bg-canvas px-3 py-2 font-mono text-[12px] text-text-primary"
              id="execution-workspace-base-dir"
            >
              {settings?.workspaceBaseDir ?? "~/Documents/Handle/workspaces"}
            </div>
          </div>
          <div>
            <label
              className="text-[12.5px] font-medium text-text-secondary"
              htmlFor="execution-cleanup-policy"
            >
              Cleanup policy
            </label>
            <select
              className="mt-2 h-[34px] w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none focus-visible:shadow-focus"
              id="execution-cleanup-policy"
              onChange={() => undefined}
              value="keep-all"
            >
              {cleanupOptions.map((option) => (
                <option
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PillButton
            disabled={opening}
            icon={
              opening ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FolderOpen className="h-3 w-3" />
              )
            }
            onClick={handleOpenWorkspace}
            variant="secondary"
          >
            Open Workspace Folder
          </PillButton>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary">
            <ExternalLink className="h-3 w-3" />
            Finder opens on this Mac
          </span>
        </div>
      </section>

      {status && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-[12.5px]",
            status.tone === "success"
              ? "border-status-success/20 bg-status-success/5 text-status-success"
              : "border-status-error/20 bg-status-error/5 text-status-error",
          )}
        >
          {status.message}
        </div>
      )}

      <div className="flex justify-end">
        <PillButton
          aria-label="Save execution settings"
          disabled={saving}
          icon={
            saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )
          }
          onClick={handleSave}
          variant="primary"
        >
          Save
        </PillButton>
      </div>
    </div>
  );
}
