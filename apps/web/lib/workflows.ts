import type { WorkflowRunSummary, WorkflowSummary } from "@handle/shared";

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
  if (!response.ok) throw new Error(await parseApiError(response, "Workflow request failed"));
  return response.json() as Promise<T>;
}

export interface WorkflowInput {
  actions: WorkflowSummary["actions"];
  enabled: boolean;
  name: string;
  triggerConnectorId: string;
  triggerEventType: string;
  triggerFilter: Record<string, unknown>;
}

export async function listWorkflows() {
  const body = await requestJson<{ workflows?: WorkflowSummary[] }>("/api/workflows");
  return body.workflows ?? [];
}

export async function createWorkflow(input: WorkflowInput) {
  const body = await requestJson<{ workflow?: WorkflowSummary }>("/api/workflows", {
    body: JSON.stringify(input),
    method: "POST",
  });
  if (!body.workflow) throw new Error("Workflow create returned no workflow");
  return body.workflow;
}

export async function updateWorkflow(workflowId: string, input: Partial<WorkflowInput>) {
  const body = await requestJson<{ workflow?: WorkflowSummary }>(`/api/workflows/${workflowId}`, {
    body: JSON.stringify(input),
    method: "PUT",
  });
  if (!body.workflow) throw new Error("Workflow update returned no workflow");
  return body.workflow;
}

export async function deleteWorkflow(workflowId: string) {
  const response = await fetch(`/api/workflows/${workflowId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Workflow delete failed"));
}

export async function runWorkflowNow(workflowId: string, eventPayload: Record<string, unknown>) {
  return requestJson<{ error?: string; runId: string; status: string }>(`/api/workflows/${workflowId}/run`, {
    body: JSON.stringify({ eventPayload }),
    method: "POST",
  });
}

export async function listWorkflowRuns(workflowId: string) {
  const body = await requestJson<{ runs?: WorkflowRunSummary[] }>(`/api/workflows/${workflowId}/runs`);
  return body.runs ?? [];
}
