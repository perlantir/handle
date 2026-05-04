"use client";

import { Check, Loader2, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { NotificationEventType, NotificationSettingsSummary, TemporalSettingsSummary } from "@handle/shared";
import { PillButton, Toggle } from "@/components/design-system";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/api";
import { useHandleAuth } from "@/lib/handleAuth";
import { cn } from "@/lib/utils";

const eventOptions: Array<{ label: string; value: NotificationEventType }> = [
  { label: "Task completed", value: "TASK_COMPLETED" },
  { label: "Task failed", value: "TASK_FAILED" },
  { label: "Approval needed", value: "APPROVAL_NEEDED" },
  { label: "Critic flagged", value: "CRITIC_FLAGGED" },
];

interface Draft {
  emailEnabled: boolean;
  emailRecipient: string;
  eventTypes: NotificationEventType[];
  slackChannelId: string;
  slackEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
}

function draftFromSettings(settings: NotificationSettingsSummary): Draft {
  return {
    emailEnabled: settings.emailEnabled,
    emailRecipient: settings.emailRecipient ?? "",
    eventTypes: settings.eventTypes,
    slackChannelId: settings.slackChannelId ?? "",
    slackEnabled: settings.slackEnabled,
    webhookEnabled: settings.webhookEnabled,
    webhookUrl: settings.webhookUrl ?? "",
  };
}

function temporalTone(status: TemporalSettingsSummary["health"]["status"]) {
  if (status === "online") return "text-status-success";
  if (status === "offline") return "text-status-error";
  return "text-text-tertiary";
}

function SettingRow({
  children,
  enabled,
  label,
  onToggle,
}: {
  children: ReactNode;
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-[13px] font-medium text-text-primary">{label}</div>
        <Toggle aria-label={`${label} enabled`} checked={enabled} onClick={onToggle} />
      </div>
      {children}
    </div>
  );
}

export function NotificationsSettings() {
  const { getToken } = useHandleAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const [temporal, setTemporal] = useState<TemporalSettingsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      const response = await getNotificationSettings({ token });
      if (cancelled) return;
      setDraft(draftFromSettings(response.notifications));
      setTemporal(response.temporal);
      setError(null);
    }

    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notifications");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const token = await getToken();
      const next = await updateNotificationSettings({
        input: {
          emailEnabled: draft.emailEnabled,
          emailRecipient: draft.emailRecipient.trim() || null,
          eventTypes: draft.eventTypes,
          slackChannelId: draft.slackChannelId.trim() || null,
          slackEnabled: draft.slackEnabled,
          webhookEnabled: draft.webhookEnabled,
          webhookUrl: draft.webhookUrl.trim() || null,
        },
        token,
      });
      setDraft(draftFromSettings(next));
      setStatus({ message: "Notifications saved", tone: "success" });
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Could not save notifications",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading notifications
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="rounded-lg border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12.5px] text-status-error">
        {error ?? "Notification settings unavailable"}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-[13px] font-medium text-text-primary">
              Temporal worker
            </h2>
            <p className="m-0 mt-1 text-[11.5px] text-text-tertiary">
              Self-hosted async runtime at {temporal?.address ?? "127.0.0.1:7233"}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border border-border-subtle bg-bg-canvas px-2.5 py-1 text-[11px] font-medium",
              temporalTone(temporal?.health.status ?? "unknown"),
            )}
          >
            {temporal?.health.status === "online" ? (
              <Check className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {temporal?.health.status ?? "unknown"}
          </span>
        </div>
        {temporal?.health.detail ? (
          <p className="m-0 mt-3 text-[11.5px] text-text-tertiary">
            {temporal.health.detail}
          </p>
        ) : null}
      </section>

      <SettingRow
        enabled={draft.emailEnabled}
        label="Email"
        onToggle={() => setDraft((current) => current && { ...current, emailEnabled: !current.emailEnabled })}
      >
        <input
          aria-label="Email notification recipient"
          className="h-9 w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          disabled={!draft.emailEnabled}
          onChange={(event) => setDraft((current) => current && { ...current, emailRecipient: event.target.value })}
          placeholder="you@example.com"
          value={draft.emailRecipient}
        />
      </SettingRow>

      <SettingRow
        enabled={draft.slackEnabled}
        label="Slack"
        onToggle={() => setDraft((current) => current && { ...current, slackEnabled: !current.slackEnabled })}
      >
        <input
          aria-label="Slack notification channel"
          className="h-9 w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          disabled={!draft.slackEnabled}
          onChange={(event) => setDraft((current) => current && { ...current, slackChannelId: event.target.value })}
          placeholder="C0123456789 or #updates"
          value={draft.slackChannelId}
        />
      </SettingRow>

      <SettingRow
        enabled={draft.webhookEnabled}
        label="Webhook"
        onToggle={() => setDraft((current) => current && { ...current, webhookEnabled: !current.webhookEnabled })}
      >
        <input
          aria-label="Webhook notification URL"
          className="h-9 w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          disabled={!draft.webhookEnabled}
          onChange={(event) => setDraft((current) => current && { ...current, webhookUrl: event.target.value })}
          placeholder="https://example.com/handle-webhook"
          value={draft.webhookUrl}
        />
      </SettingRow>

      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
        <h2 className="m-0 text-[13px] font-medium text-text-primary">
          Notify me when
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {eventOptions.map((option) => (
            <label
              className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 py-2 text-[12.5px] text-text-secondary"
              key={option.value}
            >
              <input
                checked={draft.eventTypes.includes(option.value)}
                onChange={(event) => {
                  setDraft((current) => {
                    if (!current) return current;
                    const eventTypes = event.target.checked
                      ? [...new Set([...current.eventTypes, option.value])]
                      : current.eventTypes.filter((item) => item !== option.value);
                    return { ...current, eventTypes: eventTypes.length > 0 ? eventTypes : current.eventTypes };
                  });
                }}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <PillButton disabled={saving} onClick={save} variant="primary">
          {saving ? "Saving" : "Save"}
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
            {status.tone === "success" ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {status.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
