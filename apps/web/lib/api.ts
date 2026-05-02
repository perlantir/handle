import type {
  ApprovalDecision,
  ChatMessage,
  ConversationSummary,
  CreateTaskResponse,
  PendingApproval,
  ProjectSummary,
  SendConversationMessageResponse,
  TaskDetailResponse,
} from '@handle/shared';

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

interface ProjectInput {
  browserMode?: ProjectSummary['browserMode'];
  customScopePath?: string | null;
  defaultBackend?: ProjectSummary['defaultBackend'];
  defaultModel?: string | null;
  defaultProvider?: string | null;
  name?: string;
  workspaceScope?: ProjectSummary['workspaceScope'];
}

interface SendMessageInput {
  backend?: 'e2b' | 'local';
  content: string;
  conversationId: string;
  modelName?: string;
  providerId?: string;
  token: string | null;
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

export async function listProjects({
  token,
}: AuthenticatedRequestInput): Promise<ProjectSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load projects');
    throw new Error(message);
  }

  const body = (await response.json()) as { projects?: ProjectSummary[] };
  return body.projects ?? [];
}

export async function createProject({
  input,
  token,
}: AuthenticatedRequestInput & { input: ProjectInput }): Promise<ProjectSummary> {
  const response = await fetch(`${apiBaseUrl}/api/projects`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to create project');
    throw new Error(message);
  }

  const body = (await response.json()) as { project?: ProjectSummary };
  if (!body.project) throw new Error('Project create returned no project');
  return body.project;
}

export async function updateProject({
  input,
  projectId,
  token,
}: AuthenticatedRequestInput & { input: ProjectInput; projectId: string }): Promise<ProjectSummary> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}`, {
    body: JSON.stringify(input),
    headers: authHeaders(token),
    method: 'PUT',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to update project');
    throw new Error(message);
  }

  const body = (await response.json()) as { project?: ProjectSummary };
  if (!body.project) throw new Error('Project update returned no project');
  return body.project;
}

export async function listConversations({
  projectId,
  token,
}: AuthenticatedRequestInput & { projectId: string }): Promise<ConversationSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/conversations`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load conversations');
    throw new Error(message);
  }

  const body = (await response.json()) as { conversations?: ConversationSummary[] };
  return body.conversations ?? [];
}

export async function createConversation({
  projectId,
  title,
  token,
}: AuthenticatedRequestInput & { projectId: string; title?: string }): Promise<ConversationSummary> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/conversations`, {
    body: JSON.stringify({ ...(title ? { title } : {}) }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to create conversation');
    throw new Error(message);
  }

  const body = (await response.json()) as { conversation?: ConversationSummary };
  if (!body.conversation) throw new Error('Conversation create returned no conversation');
  return body.conversation;
}

export async function listMessages({
  conversationId,
  token,
}: AuthenticatedRequestInput & { conversationId: string }): Promise<ChatMessage[]> {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load messages');
    throw new Error(message);
  }

  const body = (await response.json()) as { messages?: ChatMessage[] };
  return body.messages ?? [];
}

export async function sendConversationMessage({
  backend,
  content,
  conversationId,
  modelName,
  providerId,
  token,
}: SendMessageInput): Promise<SendConversationMessageResponse> {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
    body: JSON.stringify({
      ...(backend ? { backend } : {}),
      content,
      ...(modelName ? { modelName } : {}),
      ...(providerId ? { providerId } : {}),
    }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to send message');
    throw new Error(message);
  }

  return response.json() as Promise<SendConversationMessageResponse>;
}
