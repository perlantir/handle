import type { MemoryScope } from "@handle/shared";

export type MemoryProviderMode = "cloud" | "self-hosted";

export interface MemorySettings {
  cloudBaseURL: string;
  defaultScopeForNewProjects: MemoryScope;
  hasCloudApiKey: boolean;
  provider: MemoryProviderMode;
  selfHostedBaseURL: string;
  status: {
    checkedAt: string;
    detail?: string;
    provider: MemoryProviderMode;
    status: "offline" | "online";
  };
  updatedAt: string | null;
}

interface MemoryResponse {
  memory?: MemorySettings;
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
    const message = await parseApiError(response, "Memory settings request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getMemorySettings() {
  const body = await requestJson<MemoryResponse>("/api/settings/memory");
  if (!body.memory) throw new Error("Memory settings response was empty.");
  return body.memory;
}

export async function updateMemorySettings(input: {
  cloudBaseURL?: string | null;
  defaultScopeForNewProjects?: MemoryScope;
  provider?: MemoryProviderMode;
  selfHostedBaseURL?: string;
}) {
  const body = await requestJson<MemoryResponse>("/api/settings/memory", {
    body: JSON.stringify(input),
    method: "PUT",
  });
  if (!body.memory) throw new Error("Memory settings update returned no settings.");
  return body.memory;
}

export async function saveMemoryCloudKey(apiKey: string) {
  return requestJson<{ saved: boolean }>("/api/settings/memory/cloud-key", {
    body: JSON.stringify({ apiKey }),
    method: "POST",
  });
}

export async function startSelfHostedMemory() {
  return requestJson<{ started: boolean; stderr: string; stdout: string }>("/api/settings/memory/start", {
    method: "POST",
  });
}

export async function stopSelfHostedMemory() {
  return requestJson<{ stderr: string; stopped: boolean; stdout: string }>("/api/settings/memory/stop", {
    method: "POST",
  });
}

export async function resetMemory(confirmation: "delete") {
  return requestJson<{ deleted: number; reset: boolean }>("/api/settings/memory/reset", {
    body: JSON.stringify({ confirmation }),
    method: "POST",
  });
}
