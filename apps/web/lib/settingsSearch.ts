import type {
  MemoryScope,
  SearchProviderId,
  SearchSettingsResponse,
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
    const message = await parseApiError(response, "Search provider request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getSearchProviderSettings(projectId?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  return requestJson<SearchSettingsResponse>(
    `/api/settings/search-providers${params.size > 0 ? `?${params}` : ""}`,
  );
}

export function updateSearchProvider(
  providerId: SearchProviderId,
  input: {
    enabled?: boolean;
    memoryScope?: MemoryScope;
    rateLimitPerMinute?: number | null;
  },
) {
  return requestJson<SearchSettingsResponse>(
    `/api/settings/search-providers/${providerId}`,
    {
      body: JSON.stringify(input),
      method: "PUT",
    },
  );
}

export function saveSearchProviderKey(
  providerId: SearchProviderId,
  apiKey: string,
) {
  return requestJson<SearchSettingsResponse>(
    `/api/settings/search-providers/${providerId}/key`,
    {
      body: JSON.stringify({ apiKey }),
      method: "POST",
    },
  );
}

export function deleteSearchProviderKey(providerId: SearchProviderId) {
  return requestJson<{ deleted: boolean; providerId: SearchProviderId }>(
    `/api/settings/search-providers/${providerId}/key`,
    {
      method: "DELETE",
    },
  );
}

export function testSearchProvider(providerId: SearchProviderId) {
  return requestJson<{
    ok: boolean;
    providerId: SearchProviderId;
    resultCount: number;
    sample?: unknown;
  }>(`/api/settings/search-providers/${providerId}/test`, {
    method: "POST",
  });
}
