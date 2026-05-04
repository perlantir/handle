"use client";

import type {
  IntegrationConnectionSummary,
  IntegrationConnectorId,
  IntegrationConnectorSettingsSummary,
  IntegrationConnectorSummary,
  IntegrationSettingsResponse,
} from "@handle/shared";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
  Unplug,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PillButton } from "@/components/design-system";
import {
  completeConnection,
  createConnectSession,
  deleteIntegration,
  getIntegrationSettings,
  saveConnectorOAuthApp,
  saveNangoSettings,
  testIntegration,
} from "@/lib/settingsIntegrations";
import { cn } from "@/lib/utils";

interface ConnectorDraft {
  accountAlias: string;
  clientId: string;
  clientSecret: string;
  connectionId: string;
}

type StatusTone = "error" | "success";
type StatusState = { message: string; tone: StatusTone };

const emptyDraft: ConnectorDraft = {
  accountAlias: "default",
  clientId: "",
  clientSecret: "",
  connectionId: "",
};

function draftForConnector(): ConnectorDraft {
  return { ...emptyDraft };
}

function setupLabel(status: string) {
  if (status === "ready") return "Ready to connect";
  if (status === "connected") return "Connected";
  if (status === "error") return "Setup error";
  if (status === "local_vault") return "Local vault";
  return "Needs credentials";
}

function statusTone(status: string) {
  if (status === "ready" || status === "connected" || status === "local_vault") {
    return "text-status-success";
  }
  if (status === "error") return "text-status-error";
  return "text-status-waiting";
}

export function IntegrationsSettings() {
  const [connectLinks, setConnectLinks] = useState<
    Partial<Record<IntegrationConnectorId, string>>
  >({});
  const [drafts, setDrafts] = useState<
    Partial<Record<IntegrationConnectorId, ConnectorDraft>>
  >({});
  const [host, setHost] = useState("https://api.nango.dev");
  const [loading, setLoading] = useState(true);
  const [nangoSecret, setNangoSecret] = useState("");
  const [settings, setSettings] = useState<IntegrationSettingsResponse | null>(
    null,
  );
  const [status, setStatus] = useState<StatusState | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getIntegrationSettings()
      .then((nextSettings) => {
        if (!mounted) return;
        applySettings(nextSettings);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setStatus({
          message:
            error instanceof Error ? error.message : "Failed to load integrations",
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

  const settingsByConnector = useMemo(
    () =>
      new Map(
        settings?.connectorSettings.map((item) => [item.connectorId, item]) ?? [],
      ),
    [settings],
  );
  const connectionsByConnector = useMemo(() => {
    const map = new Map<IntegrationConnectorId, IntegrationConnectionSummary[]>();
    for (const connection of settings?.connections ?? []) {
      const current = map.get(connection.connectorId) ?? [];
      current.push(connection);
      map.set(connection.connectorId, current);
    }
    return map;
  }, [settings]);

  function applySettings(nextSettings: IntegrationSettingsResponse) {
    setSettings(nextSettings);
    setHost(nextSettings.nango.host);
    setDrafts((current) => {
      const next = { ...current };
      for (const connector of nextSettings.connectors) {
        next[connector.connectorId] =
          current[connector.connectorId] ?? draftForConnector();
      }
      return next;
    });
  }

  async function refresh() {
    const nextSettings = await getIntegrationSettings();
    applySettings(nextSettings);
    return nextSettings;
  }

  function updateDraft(
    connectorId: IntegrationConnectorId,
    patch: Partial<ConnectorDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [connectorId]: {
        ...(current[connectorId] ?? draftForConnector()),
        ...patch,
      },
    }));
  }

  async function handleSaveNango() {
    if (!nangoSecret.trim()) return;
    setWorking("nango");
    setStatus(null);
    try {
      await saveNangoSettings({
        host: host.trim() || "https://api.nango.dev",
        secretKey: nangoSecret.trim(),
      });
      setNangoSecret("");
      await refresh();
      setStatus({ message: "Nango key saved", tone: "success" });
    } catch (error: unknown) {
      setStatus({
        message: error instanceof Error ? error.message : "Failed to save Nango key",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleSaveOAuthApp(connector: IntegrationConnectorSummary) {
    const draft = drafts[connector.connectorId] ?? draftForConnector();
    setWorking(`${connector.connectorId}:save`);
    setStatus(null);
    try {
      await saveConnectorOAuthApp(connector.connectorId, {
        clientId: draft.clientId.trim(),
        clientSecret: draft.clientSecret.trim(),
      });
      updateDraft(connector.connectorId, { clientSecret: "" });
      await refresh();
      setStatus({
        message: `${connector.displayName} OAuth app saved`,
        tone: "success",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Failed to save OAuth app",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleConnect(connector: IntegrationConnectorSummary) {
    const draft = drafts[connector.connectorId] ?? draftForConnector();
    setWorking(`${connector.connectorId}:connect`);
    setStatus(null);
    try {
      const session = await createConnectSession(connector.connectorId, {
        accountAlias: draft.accountAlias.trim() || "default",
      });
      setConnectLinks((current) => ({
        ...current,
        [connector.connectorId]: session.connectLink,
      }));
      window.open(session.connectLink, "_blank", "noopener,noreferrer");
      setStatus({
        message: `${connector.displayName} Connect session started`,
        tone: "success",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Failed to start OAuth flow",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleComplete(connector: IntegrationConnectorSummary) {
    const draft = drafts[connector.connectorId] ?? draftForConnector();
    setWorking(`${connector.connectorId}:complete`);
    setStatus(null);
    try {
      await completeConnection(connector.connectorId, {
        accountAlias: draft.accountAlias.trim() || "default",
        ...(draft.connectionId.trim()
          ? { connectionId: draft.connectionId.trim() }
          : {}),
      });
      await refresh();
      setStatus({
        message: `${connector.displayName} account connected`,
        tone: "success",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Failed to complete OAuth flow",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleTestConnection(connection: IntegrationConnectionSummary) {
    setWorking(`${connection.id}:test`);
    setStatus(null);
    try {
      const result = await testIntegration(connection.id);
      await refresh();
      setStatus({
        message: result.ok
          ? `${connection.accountAlias} health check passed`
          : result.error ?? "Health check failed",
        tone: result.ok ? "success" : "error",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Connection test failed",
        tone: "error",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handleDeleteConnection(connection: IntegrationConnectionSummary) {
    setWorking(`${connection.id}:delete`);
    setStatus(null);
    try {
      await deleteIntegration(connection.id);
      await refresh();
      setStatus({
        message: `${connection.accountAlias} disconnected`,
        tone: "success",
      });
    } catch (error: unknown) {
      setStatus({
        message:
          error instanceof Error ? error.message : "Disconnect failed",
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
        Loading integrations
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-[13.5px] font-medium tracking-[-0.005em] text-text-primary">
              Nango
            </h2>
            <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
              OAuth credentials are saved from Settings and used immediately.
            </p>
          </div>
          <StatusBadge
            configured={settings?.nango.configured ?? false}
            label={
              settings?.nango.configured
                ? "Nango configured"
                : "Nango not configured"
            }
          />
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">
              Nango host
            </span>
            <TextInput
              aria-label="Nango host"
              onChange={(event) => setHost(event.target.value)}
              value={host}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-text-secondary">
              Nango secret key
            </span>
            <TextInput
              aria-label="Nango secret key"
              onChange={(event) => setNangoSecret(event.target.value)}
              placeholder="Paste Nango secret key"
              type="password"
              value={nangoSecret}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton
              disabled={working === "nango" || !nangoSecret.trim()}
              onClick={handleSaveNango}
              type="button"
            >
              {working === "nango" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Save Nango key
            </PillButton>
            <a
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12px] font-medium text-text-secondary hover:bg-bg-subtle"
              href="https://app.nango.dev"
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Nango
            </a>
          </div>
        </div>
      </section>

      {status ? (
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
      ) : null}

      <div className="grid gap-3">
        {settings?.connectors.map((connector) => {
          const connectorSettings = settingsByConnector.get(
            connector.connectorId,
          );
          const connections =
            connectionsByConnector.get(connector.connectorId) ?? [];
          return (
            <ConnectorCard
              connector={connector}
              connectorSettings={connectorSettings}
              connections={connections}
              connectLink={connectLinks[connector.connectorId]}
              draft={drafts[connector.connectorId] ?? draftForConnector()}
              key={connector.connectorId}
              onComplete={() => handleComplete(connector)}
              onConnect={() => handleConnect(connector)}
              onDeleteConnection={handleDeleteConnection}
              onDraftChange={(patch) => updateDraft(connector.connectorId, patch)}
              onSaveOAuthApp={() => handleSaveOAuthApp(connector)}
              onTestConnection={handleTestConnection}
              working={working}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  connectorSettings,
  connections,
  connectLink,
  draft,
  onComplete,
  onConnect,
  onDeleteConnection,
  onDraftChange,
  onSaveOAuthApp,
  onTestConnection,
  working,
}: {
  connector: IntegrationConnectorSummary;
  connectorSettings: IntegrationConnectorSettingsSummary | undefined;
  connections: IntegrationConnectionSummary[];
  connectLink: string | undefined;
  draft: ConnectorDraft;
  onComplete: () => void;
  onConnect: () => void;
  onDeleteConnection: (connection: IntegrationConnectionSummary) => void;
  onDraftChange: (patch: Partial<ConnectorDraft>) => void;
  onSaveOAuthApp: () => void;
  onTestConnection: (connection: IntegrationConnectionSummary) => void;
  working: string | null;
}) {
  const canSave =
    connector.authType === "nango" &&
    draft.clientId.trim().length > 0 &&
    draft.clientSecret.trim().length > 0;
  const setupStatus = connectorSettings?.setupStatus ?? "missing_credentials";

  return (
    <section className="rounded-[14px] border border-border-subtle bg-bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-[13.5px] font-medium text-text-primary">
              {connector.displayName}
            </h3>
            <span className="rounded-[999px] border border-border-subtle bg-bg-canvas px-2 py-0.5 text-[10.5px] font-medium text-text-tertiary">
              Tier {connector.tier}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-[17px] text-text-tertiary">
            {connector.description}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-[999px] border border-border-subtle bg-bg-canvas px-3 py-1.5 text-[11.5px] font-medium",
            statusTone(setupStatus),
          )}
        >
          {setupStatus === "error" ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {setupLabel(setupStatus)}
        </div>
      </div>

      {connector.authType === "nango" ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">
                {connector.displayName} OAuth client ID
              </span>
              <TextInput
                aria-label={`${connector.displayName} OAuth client ID`}
                onChange={(event) => onDraftChange({ clientId: event.target.value })}
                value={draft.clientId}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">
                {connector.displayName} OAuth client secret
              </span>
              <TextInput
                aria-label={`${connector.displayName} OAuth client secret`}
                onChange={(event) =>
                  onDraftChange({ clientSecret: event.target.value })
                }
                placeholder={
                  connectorSettings?.clientIdConfigured
                    ? "Leave blank to keep existing secret"
                    : "Paste client secret"
                }
                type="password"
                value={draft.clientSecret}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">
                Account alias
              </span>
              <TextInput
                aria-label={`${connector.displayName} account alias`}
                onChange={(event) =>
                  onDraftChange({ accountAlias: event.target.value })
                }
                value={draft.accountAlias}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">
                Connection ID
              </span>
              <TextInput
                aria-label={`${connector.displayName} connection ID`}
                onChange={(event) =>
                  onDraftChange({ connectionId: event.target.value })
                }
                placeholder="Optional after OAuth"
                value={draft.connectionId}
              />
            </label>
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-canvas px-3 py-2 text-[11.5px] leading-[17px] text-text-tertiary">
            Redirect URI:{" "}
            <span className="font-mono text-text-secondary">
              {connectorSettings?.redirectUri ?? "https://api.nango.dev/oauth/callback"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PillButton
              disabled={!canSave || working === `${connector.connectorId}:save`}
              onClick={onSaveOAuthApp}
              type="button"
            >
              {working === `${connector.connectorId}:save` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save {connector.displayName} OAuth app
            </PillButton>
            <PillButton
              disabled={working === `${connector.connectorId}:connect`}
              onClick={onConnect}
              type="button"
            >
              {working === `${connector.connectorId}:connect` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Connect {connector.displayName}
            </PillButton>
            <PillButton
              disabled={
                working === `${connector.connectorId}:complete` ||
                (!connectLink && !draft.connectionId.trim())
              }
              onClick={onComplete}
              type="button"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Finish {connector.displayName} connection
            </PillButton>
            {connector.oauthAppUrl ? (
              <a
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12px] font-medium text-text-secondary hover:bg-bg-subtle"
                href={connector.oauthAppUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                OAuth app setup
              </a>
            ) : null}
          </div>

          {connectLink ? (
            <a
              className="truncate text-[11.5px] font-medium text-accent"
              href={connectLink}
              rel="noreferrer"
              target="_blank"
            >
              {connectLink}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-canvas px-3 py-2 text-[11.5px] leading-[17px] text-text-tertiary">
          Obsidian uses a local vault path and SafetyGovernor in Phase 6.1.
        </div>
      )}

      {connections.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {connections.map((connection) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-canvas px-3 py-2"
              key={connection.id}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary">
                  {connection.accountAlias}
                </div>
                <div className="text-[11px] text-text-tertiary">
                  {connection.status}
                  {connection.defaultAccount ? " · default" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PillButton
                  disabled={working === `${connection.id}:test`}
                  onClick={() => onTestConnection(connection)}
                  type="button"
                >
                  {working === `${connection.id}:test` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <TestTube2 className="h-3.5 w-3.5" />
                  )}
                  Test {connection.accountAlias}
                </PillButton>
                <PillButton
                  disabled={working === `${connection.id}:delete`}
                  onClick={() => onDeleteConnection(connection)}
                  type="button"
                >
                  {working === `${connection.id}:delete` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Disconnect
                </PillButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StatusBadge({
  configured,
  label,
}: {
  configured: boolean;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-[999px] border border-border-subtle bg-bg-canvas px-3 py-1.5 text-[11.5px] font-medium",
        configured ? "text-status-success" : "text-status-waiting",
      )}
    >
      {configured ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Unplug className="h-3.5 w-3.5" />
      )}
      {label}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-[34px] w-full rounded-md border border-border-subtle bg-bg-canvas px-3 text-[12.5px] text-text-primary outline-none transition-shadow duration-fast placeholder:text-text-tertiary focus-visible:shadow-focus",
        props.className,
      )}
    />
  );
}
