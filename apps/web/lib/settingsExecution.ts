export type ExecutionBackend = "e2b" | "local";
export type ExecutionCleanupPolicy = "keep-all";

export interface ExecutionSettings {
  cleanupPolicy: ExecutionCleanupPolicy;
  defaultBackend: ExecutionBackend;
  updatedAt: string | null;
  workspaceBaseDir: string;
}

interface ExecutionResponse {
  execution?: ExecutionSettings;
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
    const message = await parseApiError(response, "Execution settings request failed");
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getExecutionSettings() {
  const body = await requestJson<ExecutionResponse>("/api/settings/execution");
  if (!body.execution) throw new Error("Execution settings response was empty.");
  return body.execution;
}

export async function updateExecutionSettings(input: {
  cleanupPolicy?: ExecutionCleanupPolicy;
  defaultBackend?: ExecutionBackend;
}) {
  const body = await requestJson<ExecutionResponse>("/api/settings/execution", {
    body: JSON.stringify(input),
    method: "PUT",
  });
  if (!body.execution) throw new Error("Execution settings update returned no settings.");
  return body.execution;
}

export async function openWorkspaceFolder() {
  return requestJson<{ opened: boolean; path: string }>("/api/settings/execution/open-workspace", {
    method: "POST",
  });
}
