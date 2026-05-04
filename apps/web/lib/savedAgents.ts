import type { MemoryScope, SavedAgentSummary } from "@handle/shared";

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
  if (!response.ok)
    throw new Error(
      await parseApiError(response, "Saved agent request failed"),
    );
  return response.json() as Promise<T>;
}

export interface SavedAgentInput {
  connectorAccess: string[];
  enabled: boolean;
  memoryScope: MemoryScope;
  name: string;
  outputTarget: Record<string, unknown>;
  prompt: string;
  schedule?: string | null;
  trigger: "manual" | "schedule";
}

export async function listSavedAgents() {
  const body = await requestJson<{ agents?: SavedAgentSummary[] }>(
    "/api/saved-agents",
  );
  return body.agents ?? [];
}

export async function createSavedAgent(input: SavedAgentInput) {
  const body = await requestJson<{ agent?: SavedAgentSummary }>(
    "/api/saved-agents",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
  if (!body.agent) throw new Error("Saved agent create returned no agent");
  return body.agent;
}

export async function runSavedAgent(agentId: string) {
  return requestJson<{
    agentRunId: string;
    conversationId: string;
    savedAgentRunId: string;
    status: string;
  }>(`/api/saved-agents/${agentId}/run`, { method: "POST" });
}

export async function deleteSavedAgent(agentId: string) {
  const response = await fetch(`/api/saved-agents/${agentId}`, {
    method: "DELETE",
  });
  if (!response.ok)
    throw new Error(await parseApiError(response, "Saved agent delete failed"));
}
