import type { ApprovalDecision, CreateTaskResponse, PendingApproval, TaskDetailResponse } from '@handle/shared';

const apiBaseUrl = process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? 'http://127.0.0.1:3001';

interface CreateTaskInput {
  backend?: 'e2b' | 'local';
  goal: string;
  token: string | null;
}

interface AuthenticatedRequestInput {
  token: string | null;
}

interface RespondToApprovalInput extends AuthenticatedRequestInput {
  approvalId: string;
  decision: ApprovalDecision;
}

interface ApprovalResponse {
  approvalId: string;
  status: string;
}

async function parseApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

function authHeaders(token: string | null) {
  if (!token) throw new Error('Missing Clerk session token');

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function createTask({
  backend,
  goal,
  token,
}: CreateTaskInput): Promise<CreateTaskResponse> {
  const response = await fetch(`${apiBaseUrl}/api/tasks`, {
    body: JSON.stringify({ ...(backend ? { backend } : {}), goal }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to create task');
    throw new Error(message);
  }

  return response.json() as Promise<CreateTaskResponse>;
}

export async function getTask(taskId: string, { token }: AuthenticatedRequestInput): Promise<TaskDetailResponse> {
  const response = await fetch(`${apiBaseUrl}/api/tasks/${taskId}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load task');
    throw new Error(message);
  }

  return response.json() as Promise<TaskDetailResponse>;
}

export async function listPendingApprovals({ token }: AuthenticatedRequestInput): Promise<PendingApproval[]> {
  const response = await fetch(`${apiBaseUrl}/api/approvals/pending`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load approvals');
    throw new Error(message);
  }

  const body = (await response.json()) as { approvals?: PendingApproval[] };
  return body.approvals ?? [];
}

export async function respondToApproval({
  approvalId,
  decision,
  token,
}: RespondToApprovalInput): Promise<ApprovalResponse> {
  const response = await fetch(`${apiBaseUrl}/api/approvals/respond`, {
    body: JSON.stringify({ approvalId, decision }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to respond to approval');
    throw new Error(message);
  }

  return response.json() as Promise<ApprovalResponse>;
}
