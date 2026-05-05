import type {
  IntegrationConnectionSummary,
  IntegrationConnectorId,
  IntegrationSettingsResponse,
  MemoryScope,
} from "@handle/shared";

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await parseApiError(response, "Integration request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getIntegrationSettings() {
  return requestJson<IntegrationSettingsResponse>("/api/settings/integrations");
}

export async function saveNangoSettings(input: {
  host?: string;
  secretKey: string;
}) {
  return requestJson<{
    nango: unknown;
    validation: unknown;
  }>("/api/settings/integrations/nango", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function saveConnectorOAuthApp(
  connectorId: IntegrationConnectorId,
  input: { clientId: string; clientSecret: string },
) {
  return requestJson<unknown>(
    `/api/settings/integrations/${connectorId}/oauth-app`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export async function createConnectSession(
  connectorId: IntegrationConnectorId,
  input: { accountAlias?: string },
) {
  return requestJson<{
    accountAlias: string;
    connectorId: IntegrationConnectorId;
    connectLink: string;
    expiresAt: string;
    token: string;
  }>(`/api/integrations/${connectorId}/connect-session`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function completeConnection(
  connectorId: IntegrationConnectorId,
  input: {
    accountAlias?: string;
    accountLabel?: string;
    connectionId?: string;
  },
) {
  return requestJson<{ integration: IntegrationConnectionSummary }>(
    `/api/integrations/${connectorId}/complete`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export async function saveLocalVaultIntegration(input: {
  accountAlias?: string;
  memoryScope?: MemoryScope;
  vaultPath: string;
}) {
  return requestJson<{ integration: IntegrationConnectionSummary }>(
    "/api/integrations/obsidian/local-vault",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export async function testIntegration(integrationId: string) {
  return requestJson<{
    error?: string;
    integration: IntegrationConnectionSummary;
    ok: boolean;
    profilePreview?: unknown;
  }>(`/api/integrations/${integrationId}/test`, {
    method: "POST",
  });
}

export async function updateIntegration(
  integrationId: string,
  input: {
    accountAlias?: string;
    accountLabel?: string | null;
    defaultAccount?: boolean;
    memoryScope?: MemoryScope;
  },
) {
  return requestJson<{ integration: IntegrationConnectionSummary }>(
    `/api/integrations/${integrationId}`,
    {
      body: JSON.stringify(input),
      method: "PUT",
    },
  );
}

export async function deleteIntegration(integrationId: string) {
  return requestJson<{ deleted: boolean }>(`/api/integrations/${integrationId}`, {
    method: "DELETE",
  });
}

export interface SlackChannelOption {
  id: string;
  kind: "dm" | "private" | "public";
  name: string;
}

export async function listSlackChannels() {
  return requestJson<{ channels: SlackChannelOption[] }>("/api/integrations/slack/channels");
}
