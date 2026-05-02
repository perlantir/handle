"use client";

import {
  Check,
  KeyRound,
  Loader2,
  LogIn,
  Trash2,
  Unplug,
  XCircle,
} from "lucide-react";
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
  disconnectOpenAIChatGptOAuth,
  getOpenAIChatGptOAuthStatus,
  listSettingsProviders,
  saveSettingsProviderKey,
  startOpenAIChatGptOAuth,
  testSettingsProvider,
  updateSettingsProvider,
  type OpenAIChatGptOAuthStatus,
  type SettingsProvider,
  type SettingsProviderId,
} from "@/lib/settingsProviders";
import { ExecutionSettings } from "./ExecutionSettings";

type OpenAIAuthChoice = "apiKey" | "both" | "chatgpt-oauth";

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

type SettingsSection = "Execution" | "Providers";

const settingsNav: Array<{
  disabled?: boolean;
  label: string;
  section?: SettingsSection;
}> = [
  { label: "Providers", section: "Providers" },
  { label: "Execution", section: "Execution" },
  { disabled: true, label: "Browser" },
  { disabled: true, label: "Profile" },
  { disabled: true, label: "Approvals & trust" },
  { disabled: true, label: "Memory" },
  { disabled: true, label: "Privacy" },
  { disabled: true, label: "Billing" },
  { disabled: true, label: "Keyboard" },
  { disabled: true, label: "Advanced" },
];

interface ProviderDraft {
  apiKey: string;
  authChoice: OpenAIAuthChoice;
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
    authChoice:
      provider.id === "openai" &&
      provider.authMode === "chatgpt-oauth" &&
      provider.hasApiKey
        ? "both"
        : provider.authMode,
    baseURL: provider.baseURL ?? "",
    enabled: provider.enabled,
    primaryModel: provider.primaryModel,
  };
}

function providerUpdateBody(provider: SettingsProvider, draft: ProviderDraft) {
  const body: {
    authMode?: "apiKey" | "chatgpt-oauth";
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

  if (provider.id === "openai") {
    body.authMode = draft.authChoice === "apiKey" ? "apiKey" : "chatgpt-oauth";
  }

  return body;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortProviders(providers: SettingsProvider[]) {
  return [...providers].sort(
    (a, b) => providerOrder.indexOf(a.id) - providerOrder.indexOf(b.id),
  );
}

export function SettingsProvidersScreen() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("Providers");
  const [drafts, setDrafts] = useState<
    Partial<Record<SettingsProviderId, ProviderDraft>>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<SettingsProvider[]>([]);
  const [openAiOAuthStatus, setOpenAiOAuthStatus] =
    useState<OpenAIChatGptOAuthStatus | null>(null);
  const [oauthBusy, setOauthBusy] = useState<"disconnect" | "start" | null>(
    null,
  );
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
        void getOpenAIChatGptOAuthStatus()
          .then((status) => {
            if (mounted) setOpenAiOAuthStatus(status);
          })
          .catch((error: unknown) => {
            if (!mounted) return;
            setStatuses((current) => ({
              ...current,
              openai: {
                message:
                  error instanceof Error
                    ? error.message
                    : "Failed to load ChatGPT auth status",
                tone: "error",
              },
            }));
          });
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
        ...createDraft(provider),
        apiKey: current[provider.id]?.apiKey ?? "",
        baseURL: provider.baseURL ?? "",
        enabled: provider.enabled,
        primaryModel: provider.primaryModel,
      },
    }));
  }

  function clearProviderStatus(providerId: SettingsProviderId) {
    setStatuses((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
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

  async function pollOpenAIChatGptOAuth(expiresInMs: number) {
    const deadline = Date.now() + Math.min(expiresInMs, 120_000);

    while (Date.now() < deadline) {
      await delay(1_500);
      const status = await getOpenAIChatGptOAuthStatus();
      setOpenAiOAuthStatus(status);

      if (status.signedIn || status.flowError) return status;
    }

    return getOpenAIChatGptOAuthStatus();
  }

  async function handleOpenAIChatGptSignIn() {
    setOauthBusy("start");
    clearProviderStatus("openai");

    try {
      const flow = await startOpenAIChatGptOAuth();
      window.open(flow.authUrl, "_blank", "noopener,noreferrer");
      setStatuses((current) => ({
        ...current,
        openai: {
          message: "Waiting for ChatGPT sign-in",
          tone: "success",
        },
      }));

      const status = await pollOpenAIChatGptOAuth(flow.expiresInMs);
      if (status.signedIn) {
        setStatuses((current) => ({
          ...current,
          openai: {
            message: "ChatGPT subscription connected",
            tone: "success",
          },
        }));
      } else if (status.flowError) {
        const flowError = status.flowError;
        setStatuses((current) => ({
          ...current,
          openai: { message: flowError, tone: "error" },
        }));
      }
    } catch (error: unknown) {
      setStatuses((current) => ({
        ...current,
        openai: {
          message:
            error instanceof Error ? error.message : "ChatGPT sign-in failed",
          tone: "error",
        },
      }));
    } finally {
      setOauthBusy(null);
    }
  }

  async function handleOpenAIChatGptDisconnect() {
    setOauthBusy("disconnect");
    clearProviderStatus("openai");

    try {
      await disconnectOpenAIChatGptOAuth();
      setOpenAiOAuthStatus({
        accountId: null,
        email: null,
        expires: null,
        flowError: null,
        flowState: null,
        planType: null,
        port: null,
        signedIn: false,
      });
      setStatuses((current) => ({
        ...current,
        openai: {
          message: "ChatGPT subscription disconnected",
          tone: "success",
        },
      }));
    } catch (error: unknown) {
      setStatuses((current) => ({
        ...current,
        openai: {
          message:
            error instanceof Error
              ? error.message
              : "ChatGPT disconnect failed",
          tone: "error",
        },
      }));
    } finally {
      setOauthBusy(null);
    }
  }

  function handleOpenAIAddApiFallback() {
    updateDraft("openai", { authChoice: "both" });
    window.setTimeout(() => {
      document.getElementById("openai-api-key")?.focus();
    }, 0);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_1fr] overflow-hidden">
      <aside className="border-r border-border-subtle px-4 py-6">
        <nav aria-label="Settings sections" className="flex flex-col gap-1">
          {settingsNav.map((item) => {
            const active = item.section === activeSection;

            return (
              <button
                key={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mx-2 rounded-md px-4 py-2 text-left text-[12.5px] tracking-[-0.005em]",
                  active
                    ? "bg-[rgba(20,22,26,0.05)] font-medium text-text-primary"
                    : "font-normal text-text-secondary",
                  item.disabled && "text-text-muted",
                )}
                disabled={item.disabled}
                onClick={() => {
                  if (item.section) setActiveSection(item.section);
                }}
                type="button"
              >
                {item.label}
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
              {activeSection}
            </div>
          </header>

          {activeSection === "Execution" ? <ExecutionSettings /> : null}

          {activeSection === "Providers" && loading ? (
            <div className="flex items-center gap-2 text-[12.5px] text-text-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading providers
            </div>
          ) : null}

          {activeSection === "Providers" && loadError ? (
            <div className="rounded-lg border border-status-error/20 bg-status-error/5 px-3 py-2 text-[12.5px] text-status-error">
              {loadError}
            </div>
          ) : null}

          {activeSection === "Providers" && !loading && !loadError ? (
            <div className="flex flex-col gap-3">
              {providers.map((provider) => (
                <ProviderSettingsCard
                  draft={drafts[provider.id] ?? createDraft(provider)}
                  key={provider.id}
                  oauthBusy={provider.id === "openai" ? oauthBusy : null}
                  oauthStatus={
                    provider.id === "openai" ? openAiOAuthStatus : null
                  }
                  onAddApiFallback={handleOpenAIAddApiFallback}
                  onDeleteKey={() => handleDeleteKey(provider)}
                  onDraftChange={(patch) => updateDraft(provider.id, patch)}
                  onOAuthDisconnect={handleOpenAIChatGptDisconnect}
                  onOAuthStart={handleOpenAIChatGptSignIn}
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
  oauthBusy,
  oauthStatus,
  onAddApiFallback,
  onDeleteKey,
  onDraftChange,
  onOAuthDisconnect,
  onOAuthStart,
  onSave,
  onTest,
  provider,
  saving,
  status,
  testing,
}: {
  draft: ProviderDraft;
  oauthBusy: "disconnect" | "start" | null;
  oauthStatus: OpenAIChatGptOAuthStatus | null;
  onAddApiFallback: () => void;
  onDeleteKey: () => void;
  onDraftChange: (patch: Partial<ProviderDraft>) => void;
  onOAuthDisconnect: () => void;
  onOAuthStart: () => void;
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
  const showFallbackAction =
    provider.id === "openai" &&
    status?.tone === "error" &&
    status.message.includes("OpenAI ChatGPT Subscription auth failed");

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
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary">
              <input
                checked={draft.authChoice === "apiKey"}
                name="openai-auth-mode"
                onChange={() => onDraftChange({ authChoice: "apiKey" })}
                type="radio"
              />
              API Key
            </label>
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary">
              <input
                checked={draft.authChoice === "chatgpt-oauth"}
                name="openai-auth-mode"
                onChange={() => onDraftChange({ authChoice: "chatgpt-oauth" })}
                type="radio"
              />
              ChatGPT Subscription
            </label>
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary">
              <input
                checked={draft.authChoice === "both"}
                name="openai-auth-mode"
                onChange={() => onDraftChange({ authChoice: "both" })}
                type="radio"
              />
              Both (fallback)
            </label>
          </div>
          <div className="mt-2 rounded-md border border-border-subtle bg-bg-canvas px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-text-secondary">
                {oauthStatus?.signedIn
                  ? `Signed in as ${
                      oauthStatus.email ?? oauthStatus.accountId ?? "ChatGPT"
                    }`
                  : "ChatGPT subscription not connected"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <PillButton
                  disabled={oauthBusy === "start"}
                  icon={
                    oauthBusy === "start" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <LogIn className="h-3 w-3" />
                    )
                  }
                  onClick={onOAuthStart}
                  size="sm"
                  variant="secondary"
                >
                  Sign in with ChatGPT
                </PillButton>
                <PillButton
                  disabled={
                    !oauthStatus?.signedIn || oauthBusy === "disconnect"
                  }
                  icon={
                    oauthBusy === "disconnect" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unplug className="h-3 w-3" />
                    )
                  }
                  onClick={onOAuthDisconnect}
                  size="sm"
                  variant="ghost"
                >
                  Disconnect
                </PillButton>
              </div>
            </div>
            {oauthStatus?.flowError ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-status-error">
                <span>{oauthStatus.flowError}</span>
                <PillButton
                  onClick={onAddApiFallback}
                  size="sm"
                  variant="ghost"
                >
                  Add API Key as fallback
                </PillButton>
              </div>
            ) : null}
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
                id={`${provider.id}-api-key`}
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

        {showFallbackAction ? (
          <PillButton onClick={onAddApiFallback} size="sm" variant="ghost">
            Add API Key as fallback
          </PillButton>
        ) : null}
      </div>
    </article>
  );
}
