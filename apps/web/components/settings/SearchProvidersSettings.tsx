"use client";

import { Check, ExternalLink, KeyRound, Loader2, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { MemoryScope, SearchProviderId, SearchProviderSummary } from "@handle/shared";
import { PillButton, Toggle } from "@/components/design-system";
import { cn } from "@/lib/utils";
import {
  deleteSearchProviderKey,
  getSearchProviderSettings,
  saveSearchProviderKey,
  testSearchProvider,
  updateSearchProvider,
} from "@/lib/settingsSearch";

interface Draft {
  apiKey: string;
  enabled: boolean;
  memoryScope: MemoryScope;
  rateLimitPerMinute: string;
}

interface ProviderStatus {
  message: string;
  tone: "error" | "success";
}

function draftFromProvider(provider: SearchProviderSummary): Draft {
  return {
    apiKey: "",
    enabled: provider.enabled,
    memoryScope: provider.memoryScope,
    rateLimitPerMinute: provider.rateLimitPerMinute ? String(provider.rateLimitPerMinute) : "",
  };
}

function providerInitial(providerId: SearchProviderId) {
  if (providerId === "TAVILY") return "T";
  if (providerId === "SERPER") return "S";
  return "B";
}

function providerTone(providerId: SearchProviderId) {
  if (providerId === "TAVILY") return "bg-agent-tool";
  if (providerId === "SERPER") return "bg-agent-browser";
  return "bg-accent";
}

function statusTone(provider: SearchProviderSummary) {
  if (provider.status === "configured") return "text-status-success";
  if (provider.status === "missing_key") return "text-text-tertiary";
  return "text-status-error";
}

export function SearchProvidersSettings() {
  const [drafts, setDrafts] = useState<Partial<Record<SearchProviderId, Draft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<SearchProviderSummary[]>([]);
  const [saving, setSaving] = useState<SearchProviderId | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<SearchProviderId, ProviderStatus>>>({});
  const [testing, setTesting] = useState<SearchProviderId | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSearchProviderSettings()
      .then((settings) => {
        if (cancelled) return;
        setProviders(settings.providers);
        setDrafts(
          Object.fromEntries(
            settings.providers.map((provider) => [provider.id, draftFromProvider(provider)]),
          ) as Partial<Record<SearchProviderId, Draft>>,
        );
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load search providers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateDraft(provider: SearchProviderSummary, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [provider.id]: {
        ...(current[provider.id] ?? draftFromProvider(provider)),
        ...patch,
      },
    }));
  }

  function applySettings(nextProviders: SearchProviderSummary[]) {
    setProviders(nextProviders);
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(
        nextProviders.map((provider) => [
          provider.id,
          {
            ...draftFromProvider(provider),
            apiKey: current[provider.id]?.apiKey ?? "",
          },
        ]),
      ),
    }));
  }

  async function save(provider: SearchProviderSummary) {
    const draft = drafts[provider.id] ?? draftFromProvider(provider);
    setSaving(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));

    try {
      let settings = await updateSearchProvider(provider.id, {
        enabled: draft.enabled,
        memoryScope: draft.memoryScope,
        rateLimitPerMinute: draft.rateLimitPerMinute.trim()
          ? Number(draft.rateLimitPerMinute)
          : null,
      });
      if (draft.apiKey.trim()) {
        settings = await saveSearchProviderKey(provider.id, draft.apiKey.trim());
      }
      applySettings(settings.providers);
      setDrafts((current) => ({
        ...current,
        [provider.id]: {
          ...(current[provider.id] ?? draftFromProvider(provider)),
          apiKey: "",
        },
      }));
      setStatuses((current) => ({
        ...current,
        [provider.id]: { message: `${provider.label} saved`, tone: "success" },
      }));
    } catch (err) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: err instanceof Error ? err.message : "Save failed",
          tone: "error",
        },
      }));
    } finally {
      setSaving(null);
    }
  }

  async function deleteKey(provider: SearchProviderSummary) {
    setSaving(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));
    try {
      await deleteSearchProviderKey(provider.id);
      const settings = await getSearchProviderSettings();
      applySettings(settings.providers);
      setStatuses((current) => ({
        ...current,
        [provider.id]: { message: `${provider.label} key deleted`, tone: "success" },
      }));
    } catch (err) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: err instanceof Error ? err.message : "Delete failed",
          tone: "error",
        },
      }));
    } finally {
      setSaving(null);
    }
  }

  async function test(provider: SearchProviderSummary) {
    setTesting(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));
    try {
      const result = await testSearchProvider(provider.id);
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: result.resultCount > 0 ? `${provider.label} connected` : `${provider.label} responded with no results`,
          tone: "success",
        },
      }));
    } catch (err) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: err instanceof Error ? err.message : "Connection test failed",
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
        Loading search providers
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
    <div className="grid gap-3">
      {providers.map((provider) => {
        const draft = drafts[provider.id] ?? draftFromProvider(provider);
        const status = statuses[provider.id];
        return (
          <section
            className="rounded-[14px] border border-border-subtle bg-bg-surface p-4"
            key={provider.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white",
                    providerTone(provider.id),
                  )}
                >
                  {providerInitial(provider.id)}
                </div>
                <div>
                  <h2 className="m-0 text-[13px] font-medium text-text-primary">
                    {provider.label}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-pill border border-border-subtle bg-bg-canvas px-2.5 py-1 text-[11px] font-medium",
                        statusTone(provider),
                      )}
                    >
                      {provider.status === "configured" ? (
                        <Check className="h-3 w-3" />
                      ) : provider.status === "missing_key" ? (
                        <KeyRound className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {provider.status === "configured" ? "Configured" : provider.status === "missing_key" ? "Missing key" : "Error"}
                    </span>
                    <a
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-text-tertiary hover:text-text-primary"
                      href={provider.docsUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      API docs
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
              <Toggle
                aria-label={`${provider.label} enabled`}
                checked={draft.enabled}
                onClick={() => updateDraft(provider, { enabled: !draft.enabled })}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="grid gap-1.5 text-[12px] font-medium text-text-secondary">
                API key
                <input
                  aria-label={`${provider.label} API key`}
                  className="h-9 w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  onChange={(event) => updateDraft(provider, { apiKey: event.target.value })}
                  placeholder={provider.hasApiKey ? "Leave blank to keep existing key" : "Paste API key"}
                  type="password"
                  value={draft.apiKey}
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-text-secondary">
                Rate limit/min
                <input
                  aria-label={`${provider.label} rate limit`}
                  className="h-9 w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none"
                  inputMode="numeric"
                  onChange={(event) => updateDraft(provider, { rateLimitPerMinute: event.target.value })}
                  placeholder="Optional"
                  value={draft.rateLimitPerMinute}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                Memory
                <select
                  aria-label={`${provider.label} memory scope`}
                  className="h-8 rounded-md border border-border-subtle bg-bg-canvas px-2 text-[12px] text-text-primary outline-none"
                  onChange={(event) => updateDraft(provider, { memoryScope: event.target.value as MemoryScope })}
                  value={draft.memoryScope}
                >
                  <option value="NONE">None</option>
                  <option value="PROJECT_ONLY">Project</option>
                  <option value="GLOBAL_AND_PROJECT">Global + Project</option>
                </select>
              </label>

              <PillButton disabled={saving === provider.id} onClick={() => save(provider)} variant="primary">
                {saving === provider.id ? "Saving" : "Save"}
              </PillButton>
              <PillButton disabled={testing === provider.id} onClick={() => test(provider)} variant="secondary">
                {testing === provider.id ? "Testing" : `Test ${provider.label}`}
              </PillButton>
              {provider.hasApiKey ? (
                <button
                  aria-label={`Delete ${provider.label} key`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-tertiary hover:text-status-error"
                  disabled={saving === provider.id}
                  onClick={() => deleteKey(provider)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
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
          </section>
        );
      })}
    </div>
  );
}
