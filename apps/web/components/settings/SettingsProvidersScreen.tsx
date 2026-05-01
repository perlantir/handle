"use client";

import { Check, KeyRound, Loader2, Trash2, XCircle } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { PillButton, Toggle } from "@/components/design-system";
import { cn } from "@/lib/utils";
import {
  deleteSettingsProviderKey,
  listSettingsProviders,
  saveSettingsProviderKey,
  testSettingsProvider,
  updateSettingsProvider,
  type SettingsProvider,
  type SettingsProviderId,
} from "@/lib/settingsProviders";

const providerOrder: SettingsProviderId[] = [
  "openai",
  "anthropic",
  "kimi",
  "openrouter",
  "local",
];

const providerMeta: Record<
  SettingsProviderId,
  {
    commonDefault: string;
    helper?: string;
    initials: string;
    label: string;
    tone: string;
  }
> = {
  anthropic: {
    commonDefault: "claude-opus-4-7",
    initials: "A",
    label: "Anthropic",
    tone: "bg-agent-browser",
  },
  kimi: {
    commonDefault: "kimi-k2.6",
    helper: "Use https://api.moonshot.cn/v1 if you're in China",
    initials: "K",
    label: "KIMI",
    tone: "bg-status-waiting",
  },
  local: {
    commonDefault: "llama3.1:8b",
    initials: "L",
    label: "Local",
    tone: "bg-agent-terminal",
  },
  openai: {
    commonDefault: "gpt-4o",
    initials: "O",
    label: "OpenAI",
    tone: "bg-accent",
  },
  openrouter: {
    commonDefault: "anthropic/claude-opus-4.7",
    initials: "R",
    label: "OpenRouter",
    tone: "bg-agent-tool",
  },
};

const settingsNav = [
  "Providers",
  "Profile",
  "Approvals & trust",
  "Memory",
  "Privacy",
  "Billing",
  "Keyboard",
  "Advanced",
];

interface ProviderDraft {
  apiKey: string;
  baseURL: string;
  enabled: boolean;
  primaryModel: string;
}

interface ProviderStatus {
  message: string;
  tone: "error" | "success";
}

function createDraft(provider: SettingsProvider): ProviderDraft {
  return {
    apiKey: "",
    baseURL: provider.baseURL ?? "",
    enabled: provider.enabled,
    primaryModel: provider.primaryModel,
  };
}

function providerUpdateBody(
  provider: SettingsProvider,
  draft: ProviderDraft,
) {
  const body: {
    baseURL?: string;
    enabled: boolean;
    fallbackOrder: number;
    primaryModel: string;
  } = {
    enabled: draft.enabled,
    fallbackOrder: provider.fallbackOrder,
    primaryModel: draft.primaryModel.trim(),
  };

  if (provider.id === "kimi" || provider.id === "local") {
    const baseURL = draft.baseURL.trim();
    if (baseURL) body.baseURL = baseURL;
  }

  return body;
}

function sortProviders(providers: SettingsProvider[]) {
  return [...providers].sort(
    (a, b) => providerOrder.indexOf(a.id) - providerOrder.indexOf(b.id),
  );
}

export function SettingsProvidersScreen() {
  const [drafts, setDrafts] = useState<
    Partial<Record<SettingsProviderId, ProviderDraft>>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [saving, setSaving] = useState<SettingsProviderId | null>(null);
  const [statuses, setStatuses] = useState<
    Partial<Record<SettingsProviderId, ProviderStatus>>
  >({});
  const [testing, setTesting] = useState<SettingsProviderId | null>(null);

  useEffect(() => {
    let mounted = true;

    listSettingsProviders()
      .then((nextProviders) => {
        if (!mounted) return;
        const orderedProviders = sortProviders(nextProviders);
        setProviders(orderedProviders);
        setDrafts(
          Object.fromEntries(
            orderedProviders.map((provider) => [
              provider.id,
              createDraft(provider),
            ]),
          ),
        );
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setLoadError(
          error instanceof Error ? error.message : "Failed to load providers",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  function updateDraft(
    providerId: SettingsProviderId,
    patch: Partial<ProviderDraft>,
  ) {
    setDrafts((current) => {
      const provider = providerById.get(providerId);
      if (!provider) return current;

      return {
        ...current,
        [providerId]: {
          ...(current[providerId] ?? createDraft(provider)),
          ...patch,
        },
      };
    });
  }

  function updateProviderState(provider: SettingsProvider) {
    setProviders((current) =>
      sortProviders(
        current.map((item) => (item.id === provider.id ? provider : item)),
      ),
    );
    setDrafts((current) => ({
      ...current,
      [provider.id]: {
        ...(current[provider.id] ?? createDraft(provider)),
        baseURL: provider.baseURL ?? "",
        enabled: provider.enabled,
        primaryModel: provider.primaryModel,
      },
    }));
  }

  async function handleSave(provider: SettingsProvider) {
    const draft = drafts[provider.id] ?? createDraft(provider);
    setSaving(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));

    try {
      const updated = await updateSettingsProvider(
        provider.id,
        providerUpdateBody(provider, draft),
      );

      if (provider.id !== "local" && draft.apiKey.trim()) {
        await saveSettingsProviderKey(provider.id, draft.apiKey.trim());
        updated.hasApiKey = true;
      }

      updateProviderState(updated);
      setDrafts((current) => ({
        ...current,
        [provider.id]: {
          ...(current[provider.id] ?? createDraft(updated)),
          apiKey: "",
        },
      }));
      setStatuses((current) => ({
        ...current,
        [provider.id]: { message: "Saved", tone: "success" },
      }));
    } catch (error: unknown) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: error instanceof Error ? error.message : "Save failed",
          tone: "error",
        },
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteKey(provider: SettingsProvider) {
    setSaving(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));

    try {
      await deleteSettingsProviderKey(provider.id);
      updateProviderState({ ...provider, hasApiKey: false });
      setStatuses((current) => ({
        ...current,
        [provider.id]: { message: "Key deleted", tone: "success" },
      }));
    } catch (error: unknown) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: error instanceof Error ? error.message : "Delete failed",
          tone: "error",
        },
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleTest(provider: SettingsProvider) {
    setTesting(provider.id);
    setStatuses((current) => ({ ...current, [provider.id]: undefined }));

    try {
      const result = await testSettingsProvider(provider.id);
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message: result.response ? `OK: ${result.response}` : "OK",
          tone: "success",
        },
      }));
    } catch (error: unknown) {
      setStatuses((current) => ({
        ...current,
        [provider.id]: {
          message:
            error instanceof Error ? error.message : "Connection test failed",
          tone: "error",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_1fr] overflow-hidden">
      <aside className="border-r border-border-subtle px-4 py-6">
        <nav aria-label="Settings sections" className="flex flex-col gap-1">
          {settingsNav.map((label) => {
            const active = label === "Providers";

            return (
              <button
                key={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mx-2 rounded-md px-4 py-2 text-left text-[12.5px] tracking-[-0.005em]",
                  active
                    ? "bg-[rgba(20,22,26,0.05)] font-medium text-text-primary"
                    : "font-normal text-text-secondary",
                )}
                disabled={!active}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 overflow-y-auto px-14 py-8">
        <div className="max-w-[760px]">
          <header className="mb-7">
            <h1 className="m-0 font-display text-[22px] font-medium tracking-[-0.02em] text-text-primary">
              Settings
            </h1>
            <div className="mt-5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">
              Providers
            </div>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading providers
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-lg border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12.5px] text-status-error">
              {loadError}
            </div>
          ) : null}

          {!loading && !loadError ? (
            <div className="flex flex-col gap-3">
              {providers.map((provider) => (
                <ProviderSettingsCard
                  draft={drafts[provider.id] ?? createDraft(provider)}
                  key={provider.id}
                  onDeleteKey={() => handleDeleteKey(provider)}
                  onDraftChange={(patch) => updateDraft(provider.id, patch)}
                  onSave={() => handleSave(provider)}
                  onTest={() => handleTest(provider)}
                  provider={provider}
                  saving={saving === provider.id}
                  status={statuses[provider.id]}
                  testing={testing === provider.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[12.5px] font-medium text-text-secondary">
      {children}
    </label>
  );
}

function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-[34px] w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none transition-shadow duration-fast placeholder:text-text-tertiary focus-visible:shadow-focus",
        className,
      )}
      {...props}
    />
  );
}

function ProviderSettingsCard({
  draft,
  onDeleteKey,
  onDraftChange,
  onSave,
  onTest,
  provider,
  saving,
  status,
  testing,
}: {
  draft: ProviderDraft;
  onDeleteKey: () => void;
  onDraftChange: (patch: Partial<ProviderDraft>) => void;
  onSave: () => void;
  onTest: () => void;
  provider: SettingsProvider;
  saving: boolean;
  status: ProviderStatus | undefined;
  testing: boolean;
}) {
  const meta = providerMeta[provider.id];
  const showBaseURL = provider.id === "kimi" || provider.id === "local";
  const showApiKey = provider.id !== "local";

  return (
    <article
      aria-label={`${meta.label} provider settings`}
      className="rounded-[14px] border border-border-subtle bg-bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[16px] font-semibold text-white",
            meta.tone,
          )}
        >
          {meta.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
                {meta.label}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                {provider.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-text-tertiary">Enabled</span>
              <Toggle
                aria-label={`${meta.label} enabled`}
                checked={draft.enabled}
                onClick={() => onDraftChange({ enabled: !draft.enabled })}
              />
            </div>
          </div>
        </div>
      </div>

      {provider.id === "openai" ? (
        <fieldset className="mt-5 grid gap-2">
          <legend className="text-[12.5px] font-medium text-text-secondary">
            OpenAI auth mode
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary">
              <input checked name="openai-auth-mode" readOnly type="radio" />
              API Key
            </label>
            <label
              className="flex h-[34px] items-center gap-2 rounded-md border border-border-subtle bg-bg-subtle px-3 text-[12.5px] text-text-tertiary"
              title="Coming in step 8"
            >
              <input disabled name="openai-auth-mode" type="radio" />
              ChatGPT Subscription (OAuth)
              <span className="ml-auto text-[11px]">Coming in step 8</span>
            </label>
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <FieldLabel>{meta.label} primary model</FieldLabel>
          <TextInput
            aria-label={`${meta.label} primary model`}
            onChange={(event) =>
              onDraftChange({ primaryModel: event.currentTarget.value })
            }
            value={draft.primaryModel}
          />
          <p className="m-0 text-[11.5px] text-text-tertiary">
            Common default:{" "}
            <span className="font-mono text-[11.5px]">
              {meta.commonDefault}
            </span>
          </p>
        </div>

        {showBaseURL ? (
          <div className="grid gap-2">
            <FieldLabel>{meta.label} base URL</FieldLabel>
            <TextInput
              aria-label={`${meta.label} base URL`}
              onChange={(event) =>
                onDraftChange({ baseURL: event.currentTarget.value })
              }
              placeholder={
                provider.id === "local"
                  ? "http://127.0.0.1:11434/v1"
                  : "https://api.moonshot.ai/v1"
              }
              value={draft.baseURL}
            />
            {meta.helper ? (
              <p className="m-0 text-[11.5px] text-text-tertiary">
                {meta.helper}
              </p>
            ) : null}
          </div>
        ) : null}

        {showApiKey ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>{meta.label} API key</FieldLabel>
              {provider.hasApiKey && !draft.apiKey ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-success">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <TextInput
                aria-label={`${meta.label} API key`}
                autoComplete="off"
                onChange={(event) =>
                  onDraftChange({ apiKey: event.currentTarget.value })
                }
                placeholder={provider.hasApiKey ? "••••••••" : "Paste API key"}
                type="password"
                value={draft.apiKey}
              />
              <PillButton
                aria-label={`Delete ${meta.label} key`}
                disabled={!provider.hasApiKey || saving}
                icon={<Trash2 className="h-3 w-3" />}
                onClick={onDeleteKey}
                size="sm"
                variant="ghost"
              >
                Delete key
              </PillButton>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <PillButton
          disabled={testing || saving}
          icon={
            testing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <KeyRound className="h-3 w-3" />
            )
          }
          onClick={onTest}
          variant="secondary"
        >
          Test Connection
        </PillButton>
        <PillButton
          disabled={saving || testing || !draft.primaryModel.trim()}
          onClick={onSave}
          variant="primary"
        >
          {saving ? "Saving" : "Save"}
        </PillButton>

        {status ? (
          <span
            className={cn(
              "ml-auto inline-flex min-h-[22px] items-center gap-1.5 rounded-pill px-2.5 text-[11px] font-medium",
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
    </article>
  );
}
