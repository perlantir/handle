"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { listSlackChannels, type SlackChannelOption } from "@/lib/settingsIntegrations";

interface SlackChannelPickerProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export function SlackChannelPicker({
  disabled = false,
  label,
  onChange,
  value,
}: SlackChannelPickerProps) {
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await listSlackChannels();
      setChannels(result.channels);
      if (!value && result.channels[0]) onChange(result.channels[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Slack channels");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!disabled) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11.5px] font-medium text-text-secondary" htmlFor={`${label}-slack-channel`}>
          {label}
        </label>
        <button
          aria-label={`Refresh ${label} Slack channels`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle px-2 text-[11px] text-text-tertiary hover:text-text-primary"
          disabled={disabled || loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {channels.length > 0 ? (
        <select
          aria-label={label}
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          disabled={disabled}
          id={`${label}-slack-channel`}
          onChange={(event) => onChange(event.target.value)}
          value={channels.some((channel) => channel.id === value) ? value : value.startsWith("#") ? value : channels[0]?.id ?? ""}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name} · {channel.kind}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          className="h-9 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
          disabled={disabled}
          id={`${label}-slack-channel`}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#updates or C0123456789"
          value={value}
        />
      )}
      {error ? (
        <div className="rounded-md border border-status-error/20 bg-status-error/5 px-3 py-2 text-[11.5px] text-status-error">
          {error}. You can still paste a channel ID or #name manually.
        </div>
      ) : null}
    </div>
  );
}
