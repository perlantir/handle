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
  return requestJson<TestProviderResponse>(`/api/settings/providers/${id}/test`, {
    method: "POST",
  });
}
