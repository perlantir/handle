import type {
  ApprovalDecision,
  ActionLogSummary,
  ActionOutcomeType,
  ChatMessage,
  ConversationSummary,
  CreateTaskResponse,
  FailurePatternSummary,
  MemoryFactSummary,
  ProcedureTemplateSummary,
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
  alwaysApprove?: boolean;
  approvalId: string;
  decision: ApprovalDecision;
}

interface ApprovalResponse {
  approvalId: string;
  status: string;
}

interface ProjectInput {
  agentExecutionMode?: ProjectSummary['agentExecutionMode'];
  browserMode?: ProjectSummary['browserMode'];
  criticEnabled?: boolean;
  criticModelName?: string | null;
  criticModelProvider?: string | null;
  criticScope?: ProjectSummary['criticScope'];
  customScopePath?: string | null;
  defaultBackend?: ProjectSummary['defaultBackend'];
  defaultModel?: string | null;
  defaultProvider?: string | null;
  maxCostCents?: number;
  maxParallelSubRuns?: number;
  maxRevisionLoops?: number;
  maxRuntimeSeconds?: number;
  maxSpecialistSubRuns?: number;
  maxSupervisorTurns?: number;
  maxToolCalls?: number;
  memoryScope?: ProjectSummary['memoryScope'];
  name?: string;
  permissionMode?: ProjectSummary['permissionMode'];
  workspaceScope?: ProjectSummary['workspaceScope'];
}

interface SendMessageInput {
  backend?: 'e2b' | 'local';
  content: string;
  conversationId: string;
  memoryEnabled?: boolean;
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

export async function listMemoryFacts({
  projectId,
  scope = 'all',
  token,
}: AuthenticatedRequestInput & {
  projectId?: string;
  scope?: 'all' | 'global' | 'project';
}): Promise<{ facts: MemoryFactSummary[]; status: { provider?: string; status: 'online' | 'offline'; detail?: string } }> {
  const params = new URLSearchParams({ scope });
  if (projectId) params.set('projectId', projectId);
  const response = await fetch(`${apiBaseUrl}/api/memory/facts?${params.toString()}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load memory');
    throw new Error(message);
  }

  const body = (await response.json()) as {
    facts?: MemoryFactSummary[];
    status?: { provider?: string; status?: 'online' | 'offline'; detail?: string };
  };
  return {
    facts: body.facts ?? [],
    status: {
      status: body.status?.status ?? 'offline',
      ...(body.status?.provider ? { provider: body.status.provider } : {}),
      ...(body.status?.detail ? { detail: body.status.detail } : {}),
    },
  };
}

export async function deleteMemorySession({
  sessionId,
  token,
}: AuthenticatedRequestInput & { sessionId: string }): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/memory/facts/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(token),
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to delete memory');
    throw new Error(message);
  }
}

export async function listProcedureTemplates({
  token,
}: AuthenticatedRequestInput): Promise<ProcedureTemplateSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/memory/procedures`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load procedures');
    throw new Error(message);
  }

  const body = (await response.json()) as { procedures?: ProcedureTemplateSummary[] };
  return body.procedures ?? [];
}

export async function listFailurePatterns({
  token,
}: AuthenticatedRequestInput): Promise<FailurePatternSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/memory/failures`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load failure patterns');
    throw new Error(message);
  }

  const body = (await response.json()) as { failures?: FailurePatternSummary[] };
  return body.failures ?? [];
}

export async function listActions({
  conversationId,
  from,
  outcomeType,
  projectId,
  q,
  to,
  token,
}: AuthenticatedRequestInput & {
  conversationId?: string;
  from?: string;
  outcomeType?: ActionOutcomeType | '';
  projectId?: string;
  q?: string;
  to?: string;
}): Promise<ActionLogSummary[]> {
  const params = new URLSearchParams();
  if (conversationId) params.set('conversationId', conversationId);
  if (from) params.set('from', from);
  if (outcomeType) params.set('outcomeType', outcomeType);
  if (projectId) params.set('projectId', projectId);
  if (q) params.set('q', q);
  if (to) params.set('to', to);
  const response = await fetch(`${apiBaseUrl}/api/actions${params.size > 0 ? `?${params.toString()}` : ''}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to load actions');
    throw new Error(message);
  }

  const body = (await response.json()) as { actions?: ActionLogSummary[] };
  return body.actions ?? [];
}

export async function undoAction({
  actionId,
  token,
}: AuthenticatedRequestInput & { actionId: string }): Promise<{ undone: boolean }> {
  const response = await fetch(`${apiBaseUrl}/api/actions/${encodeURIComponent(actionId)}/undo`, {
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to undo action');
    throw new Error(message);
  }

  return response.json() as Promise<{ undone: boolean }>;
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

export async function cancelAgentRun(
  agentRunId: string,
  { token }: AuthenticatedRequestInput,
): Promise<{ active: boolean; cancelled: boolean; status: string }> {
  const response = await fetch(`${apiBaseUrl}/api/agent-runs/${agentRunId}/cancel`, {
    body: JSON.stringify({ reason: 'Cancelled by user' }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to cancel run');
    throw new Error(message);
  }

  return response.json() as Promise<{ active: boolean; cancelled: boolean; status: string }>;
}

export async function pauseAgentRun(
  agentRunId: string,
  { token }: AuthenticatedRequestInput,
): Promise<{ active: boolean; paused: boolean; status: string }> {
  const response = await fetch(`${apiBaseUrl}/api/agent-runs/${agentRunId}/pause`, {
    body: JSON.stringify({ reason: 'Paused by user' }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to pause run');
    throw new Error(message);
  }

  return response.json() as Promise<{ active: boolean; paused: boolean; status: string }>;
}

export async function resumeAgentRun(
  agentRunId: string,
  { token }: AuthenticatedRequestInput,
): Promise<{ resumed: boolean; status: string }> {
  const response = await fetch(`${apiBaseUrl}/api/agent-runs/${agentRunId}/resume`, {
    body: JSON.stringify({}),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to resume run');
    throw new Error(message);
  }

  return response.json() as Promise<{ resumed: boolean; status: string }>;
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
  alwaysApprove,
  approvalId,
  decision,
  token,
}: RespondToApprovalInput): Promise<ApprovalResponse> {
  const response = await fetch(`${apiBaseUrl}/api/approvals/respond`, {
    body: JSON.stringify({ ...(alwaysApprove ? { alwaysApprove } : {}), approvalId, decision }),
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to respond to approval');
    throw new Error(message);
  }

  return response.json() as Promise<ApprovalResponse>;
}

export async function pickProjectFolder({
  token,
}: AuthenticatedRequestInput): Promise<{ path: string }> {
  const response = await fetch(`${apiBaseUrl}/api/projects/pick-folder`, {
    headers: authHeaders(token),
    method: 'POST',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to choose folder');
    throw new Error(message);
  }

  const body = (await response.json()) as { path?: string };
  if (!body.path) throw new Error('Folder picker returned no path');
  return { path: body.path };
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

export async function deleteProject({
  projectId,
  token,
}: AuthenticatedRequestInput & { projectId: string }): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}`, {
    headers: authHeaders(token),
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to delete project');
    throw new Error(message);
  }
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

export async function updateConversation({
  conversationId,
  title,
  token,
}: AuthenticatedRequestInput & { conversationId: string; title: string }): Promise<ConversationSummary> {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}`, {
    body: JSON.stringify({ title }),
    headers: authHeaders(token),
    method: 'PUT',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to rename chat');
    throw new Error(message);
  }

  const body = (await response.json()) as { conversation?: ConversationSummary };
  if (!body.conversation) throw new Error('Conversation update returned no conversation');
  return body.conversation;
}

export async function deleteConversation({
  conversationId,
  token,
}: AuthenticatedRequestInput & { conversationId: string }): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}`, {
    headers: authHeaders(token),
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await parseApiError(response, 'Failed to delete chat');
    throw new Error(message);
  }
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
  memoryEnabled,
  modelName,
  providerId,
  token,
}: SendMessageInput): Promise<SendConversationMessageResponse> {
  const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
    body: JSON.stringify({
      ...(backend ? { backend } : {}),
      content,
      ...(memoryEnabled === undefined ? {} : { memoryEnabled }),
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
