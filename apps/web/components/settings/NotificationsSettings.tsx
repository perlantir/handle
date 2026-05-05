"use client";

import { Check, Loader2, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { NotificationChannel, NotificationChannelStatusSummary, NotificationEventType, NotificationSettingsSummary, TemporalSettingsSummary } from "@handle/shared";
import { PillButton, Toggle } from "@/components/design-system";
import { SlackChannelPicker } from "./SlackChannelPicker";
import { getNotificationSettings, testNotificationChannel, updateNotificationSettings } from "@/lib/api";
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

const channelLabels: Record<NotificationChannel, string> = {
  EMAIL: "Email",
  SLACK: "Slack",
  WEBHOOK: "Webhook",
};

function statusTone(status?: string | null) {
  if (status === "SENT") return "bg-status-success/10 text-status-success";
  if (status === "FAILED") return "bg-status-error/10 text-status-error";
  return "bg-bg-canvas text-text-tertiary";
}

function statusText(status?: string | null) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "FAILED";
  return "never tested";
}

function formatTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function validateTarget(channel: NotificationChannel, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Target is required";
  if (channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Enter a valid email address";
  }
  if (channel === "SLACK" && !/^(#[A-Za-z0-9._-]+|[CGD][A-Z0-9]{8,})$/.test(trimmed)) {
    return "Use #channel-name or a Slack channel ID";
  }
  if (channel === "WEBHOOK") {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "Webhook URL must use http or https";
    } catch {
      return "Enter a valid webhook URL";
    }
  }
  return null;
}

function SettingRow({
  children,
  enabled,
  label,
  onToggle,
  status,
  testDisabled,
  testResult,
  testing,
  onTest,
}: {
  children: ReactNode;
  enabled: boolean;
  label: string;
  onToggle: () => void;
  status?: NotificationChannelStatusSummary | undefined;
  testDisabled?: boolean;
  testResult?: { message: string; tone: "error" | "success" } | null;
  testing?: boolean;
  onTest?: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-text-primary">{label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
            <span className={cn("rounded-pill px-2 py-0.5 font-medium", statusTone(status?.lastTestStatus))}>
              Test: {statusText(status?.lastTestStatus)}
            </span>
            {status?.lastTestAt ? <span>{formatTime(status.lastTestAt)}</span> : null}
          </div>
        </div>
        <Toggle aria-label={`${label} enabled`} checked={enabled} onClick={onToggle} />
      </div>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PillButton disabled={testDisabled || testing} onClick={onTest} type="button" variant="secondary">
          {testing ? "Testing" : "Test connection"}
        </PillButton>
        {testResult ? (
          <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium", testResult.tone === "success" ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error")}>
            {testResult.tone === "success" ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {testResult.message}
          </span>
        ) : null}
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-canvas px-3 py-2 text-[11.5px] text-text-tertiary">
        <span className="font-medium text-text-secondary">Last delivery: </span>
        {status?.lastDeliveryStatus ? (
          <>
            <span className={status?.lastDeliveryStatus === "FAILED" ? "text-status-error" : "text-status-success"}>
              {status.lastDeliveryStatus === "SENT" ? "success" : status.lastDeliveryStatus}
            </span>
            {status.lastDeliveryAt ? <span> · {formatTime(status.lastDeliveryAt)}</span> : null}
            {status.lastDeliveryStatus === "FAILED" && status.lastDeliveryError ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-status-error">Why?</summary>
                <p className="m-0 mt-1 text-status-error">{status.lastDeliveryError}</p>
              </details>
            ) : null}
          </>
        ) : (
          "never delivered"
        )}
      </div>
    </div>
  );
}

export function NotificationsSettings() {
  const { getToken } = useHandleAuth();
  const [channelStatus, setChannelStatus] = useState<NotificationChannelStatusSummary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failureBanner, setFailureBanner] = useState<string | null>(null);
  const [failureBannerDismissed, setFailureBannerDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const [temporal, setTemporal] = useState<TemporalSettingsSummary | null>(null);
  const [testing, setTesting] = useState<NotificationChannel | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<NotificationChannel, { message: string; tone: "error" | "success" } | null>>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      const response = await getNotificationSettings({ token });
      if (cancelled) return;
      setChannelStatus(response.channelStatus ?? []);
      setDraft(draftFromSettings(response.notifications));
      setFailureBanner(response.failureBanner ?? null);
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

  function statusFor(channel: NotificationChannel) {
    return channelStatus.find((item) => item.channel === channel);
  }

  function recipientFor(channel: NotificationChannel) {
    if (!draft) return "";
    if (channel === "EMAIL") return draft.emailRecipient;
    if (channel === "SLACK") return draft.slackChannelId;
    return draft.webhookUrl;
  }

  async function runTest(channel: NotificationChannel) {
    if (!draft) return;
    const recipient = recipientFor(channel);
    const validation = validateTarget(channel, recipient);
    if (validation) {
      setTestResults((current) => ({
        ...current,
        [channel]: { message: `Test failed - ${validation}`, tone: "error" },
      }));
      return;
    }
    setTesting(channel);
    setTestResults((current) => ({ ...current, [channel]: null }));
    try {
      const token = await getToken();
      const result = await testNotificationChannel({ channel, recipient, token });
      if (result.status) {
        setChannelStatus((current) => [
          result.status!,
          ...current.filter((item) => item.channel !== channel),
        ]);
      }
      setTestResults((current) => ({
        ...current,
        [channel]: {
          message: result.ok
            ? "Test successful - message delivered"
            : `Test failed - ${result.error ?? "delivery failed"}`,
          tone: result.ok ? "success" : "error",
        },
      }));
    } catch (err) {
      setTestResults((current) => ({
        ...current,
        [channel]: {
          message: err instanceof Error ? `Test failed - ${err.message}` : "Test failed",
          tone: "error",
        },
      }));
    } finally {
      setTesting(null);
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

      {failureBanner && !failureBannerDismissed ? (
        <section className="rounded-[14px] border border-status-error/25 bg-status-error/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12.5px] font-medium text-status-error">{failureBanner}</div>
            <button
              className="text-[11.5px] text-text-tertiary hover:text-text-primary"
              onClick={() => setFailureBannerDismissed(true)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <SettingRow
        enabled={draft.emailEnabled}
        label="Email"
        onToggle={() => setDraft((current) => current && { ...current, emailEnabled: !current.emailEnabled })}
        onTest={() => void runTest("EMAIL")}
        status={statusFor("EMAIL")}
        testDisabled={!draft.emailEnabled}
        testing={testing === "EMAIL"}
        testResult={testResults.EMAIL ?? null}
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
        onTest={() => void runTest("SLACK")}
        status={statusFor("SLACK")}
        testDisabled={!draft.slackEnabled}
        testing={testing === "SLACK"}
        testResult={testResults.SLACK ?? null}
      >
        <SlackChannelPicker
          disabled={!draft.slackEnabled}
          label="Slack notification channel"
          onChange={(value) => setDraft((current) => current && { ...current, slackChannelId: value })}
          value={draft.slackChannelId}
        />
      </SettingRow>

      <SettingRow
        enabled={draft.webhookEnabled}
        label="Webhook"
        onToggle={() => setDraft((current) => current && { ...current, webhookEnabled: !current.webhookEnabled })}
        onTest={() => void runTest("WEBHOOK")}
        status={statusFor("WEBHOOK")}
        testDisabled={!draft.webhookEnabled}
        testing={testing === "WEBHOOK"}
        testResult={testResults.WEBHOOK ?? null}
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
