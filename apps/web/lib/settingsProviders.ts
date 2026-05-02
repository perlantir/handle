export type SettingsProviderId =
  | "anthropic"
  | "kimi"
  | "local"
  | "openai"
  | "openrouter";

export interface SettingsProvider {
  authMode: "apiKey" | "chatgpt-oauth";
  baseURL: string | null;
  description: string;
  enabled: boolean;
  fallbackOrder: number;
  hasApiKey: boolean;
  id: SettingsProviderId;
  modelName: string | null;
  primaryModel: string;
  updatedAt: string | null;
}

export interface UpdateSettingsProviderInput {
  authMode?: "apiKey" | "chatgpt-oauth";
  baseURL?: string;
  enabled?: boolean;
  fallbackOrder?: number;
  modelName?: string;
  primaryModel?: string;
}

interface ProvidersResponse {
  providers?: SettingsProvider[];
}

interface ProviderResponse {
  provider?: SettingsProvider;
}

export interface TestProviderResponse {
  ok: boolean;
  providerId: SettingsProviderId;
  response?: string;
}

export interface OpenAIChatGptOAuthStatus {
  accountId: string | null;
  email: string | null;
  expires: number | null;
  flowError: string | null;
  flowState: string | null;
  planType: string | null;
  port: number | null;
  signedIn: boolean;
}

export interface OpenAIChatGptOAuthStart {
  authUrl: string;
  expiresInMs: number;
  port: number;
  providerId: "openai";
  redirectUri: string;
  state: string;
}

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
    const message = await parseApiError(response, "Settings request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function listSettingsProviders() {
  const body = await requestJson<ProvidersResponse>("/api/settings/providers");
  return body.providers ?? [];
}

export async function updateSettingsProvider(
  id: SettingsProviderId,
  input: UpdateSettingsProviderInput,
) {
  const body = await requestJson<ProviderResponse>(
    `/api/settings/providers/${id}`,
    {
      body: JSON.stringify(input),
      method: "PUT",
    },
  );

  if (!body.provider) throw new Error("Provider update returned no provider.");
  return body.provider;
}

export async function saveSettingsProviderKey(
  id: SettingsProviderId,
  apiKey: string,
) {
  return requestJson<{ providerId: SettingsProviderId; saved: boolean }>(
    `/api/settings/providers/${id}/key`,
    {
      body: JSON.stringify({ apiKey }),
      method: "POST",
    },
  );
}

export async function deleteSettingsProviderKey(id: SettingsProviderId) {
  return requestJson<{ deleted: boolean; providerId: SettingsProviderId }>(
    `/api/settings/providers/${id}/key`,
    {
      method: "DELETE",
    },
  );
}

export async function testSettingsProvider(id: SettingsProviderId) {
  return requestJson<TestProviderResponse>(
    `/api/settings/providers/${id}/test`,
    {
      method: "POST",
    },
  );
}

export async function startOpenAIChatGptOAuth() {
  return requestJson<OpenAIChatGptOAuthStart>(
    "/api/settings/providers/openai/oauth/start",
    { method: "POST" },
  );
}

export async function getOpenAIChatGptOAuthStatus() {
  const body = await requestJson<{
    providerId: "openai";
    status: OpenAIChatGptOAuthStatus;
  }>("/api/settings/providers/openai/oauth/status");

  return body.status;
}

export async function refreshOpenAIChatGptOAuth() {
  const body = await requestJson<{
    providerId: "openai";
    status: OpenAIChatGptOAuthStatus;
  }>("/api/settings/providers/openai/oauth/refresh", { method: "POST" });

  return body.status;
}

export async function disconnectOpenAIChatGptOAuth() {
  return requestJson<{ disconnected: boolean; providerId: "openai" }>(
    "/api/settings/providers/openai/oauth/disconnect",
    { method: "DELETE" },
  );
}
