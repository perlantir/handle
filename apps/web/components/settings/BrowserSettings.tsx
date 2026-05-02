"use client";

import { Loader2, RotateCcw, Save, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { PillButton } from "@/components/design-system";
import {
  getBrowserSettings,
  resetBrowserProfile,
  testActualChromeConnection,
  updateBrowserSettings,
  type BrowserMode,
  type BrowserSettings as BrowserSettingsState,
} from "@/lib/settingsBrowser";
import { cn } from "@/lib/utils";

interface StatusState {
  message: string;
  tone: "error" | "success";
}

const actualChromeCommand =
  "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222";

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

export function BrowserSettings() {
  const [confirmReset, setConfirmReset] = useState(false);
  const [draftMode, setDraftMode] =
    useState<BrowserMode>("separate-profile");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BrowserSettingsState | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let mounted = true;

    getBrowserSettings()
      .then((nextSettings) => {
        if (!mounted) return;
        setSettings(nextSettings);
        setDraftMode(nextSettings.mode);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setStatus({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load browser settings",
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
      const nextSettings = await updateBrowserSettings({ mode: draftMode });
      setSettings(nextSettings);
      setStatus({ message: "Browser settings saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Failed to save browser settings",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetProfile() {
    setResetting(true);
    setStatus(null);

    try {
      await resetBrowserProfile();
      setConfirmReset(false);
      setStatus({ message: "Separate profile reset", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Failed to reset browser profile",
        tone: "error",
      });
    } finally {
      setResetting(false);
    }
  }

  async function handleTestActualChrome() {
    setTesting(true);
    setStatus(null);

    try {
      const result = await testActualChromeConnection();
      setStatus({
        message: result.connected
          ? `Actual Chrome connected: ${result.detail ?? result.endpoint}`
          : `Actual Chrome not connected: ${result.detail ?? result.endpoint}`,
        tone: result.connected ? "success" : "error",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error
            ? error.message
            : "Failed to test actual Chrome connection",
        tone: "error",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading browser settings
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="mb-4">
          <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
            Browser mode
          </h2>
          <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
            Local browser tasks use a separate profile by default. Actual Chrome
            always requires fresh approval.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard
            checked={draftMode === "separate-profile"}
            description="Safe default. Handle launches a visible Chrome window with its own profile."
            label="Separate profile"
            onChange={() => setDraftMode("separate-profile")}
          />
          <RadioCard
            checked={draftMode === "actual-chrome"}
            description="Advanced. Connect to your own Chrome only after explicit approval."
            label="Use my actual Chrome"
            onChange={() => setDraftMode("actual-chrome")}
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              className="text-[12.5px] font-medium text-text-secondary"
              htmlFor="browser-profile-dir"
            >
              Separate profile location
            </label>
            <div
              className="mt-2 rounded-md border border-border-subtle bg-bg-canvas px-3 py-2 font-mono text-[12px] text-text-primary"
              id="browser-profile-dir"
            >
              {settings?.profileDir ?? "~/.config/handle/chrome-profile"}
            </div>
          </div>
          <div className="flex items-end">
            {confirmReset ? (
              <PillButton
                disabled={resetting}
                icon={
                  resetting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )
                }
                onClick={handleResetProfile}
                variant="secondary"
              >
                Confirm reset
              </PillButton>
            ) : (
              <PillButton
                icon={<RotateCcw className="h-3 w-3" />}
                onClick={() => setConfirmReset(true)}
                variant="secondary"
              >
                Reset profile
              </PillButton>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
          Actual Chrome setup
        </h2>
        <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
          Start Chrome with the debugging port yourself before using actual
          Chrome mode.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border-subtle bg-bg-canvas px-3 py-2 font-mono text-[11.5px] text-text-primary">
          {actualChromeCommand}
        </pre>
        <div className="mt-4">
          <PillButton
            disabled={testing}
            icon={
              testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wifi className="h-3 w-3" />
              )
            }
            onClick={handleTestActualChrome}
            variant="secondary"
          >
            Test connection
          </PillButton>
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
          aria-label="Save browser settings"
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
