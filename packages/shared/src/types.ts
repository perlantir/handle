export type TaskStatus = 'RUNNING' | 'WAITING' | 'STOPPED' | 'ERROR' | 'PAUSED';

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export type SideEffectClass = 'read' | 'write' | 'execute' | 'network';

export interface ThoughtEvent {
  type: 'thought';
  content: string;
  taskId: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolName: string;
  args: Record<string, unknown>;
  callId: string;
  taskId: string;
}

export interface ToolStreamEvent {
  type: 'tool_stream';
  callId: string;
  channel: 'stdout' | 'stderr';
  content: string;
  taskId: string;
}

export interface ToolResultEvent {
  type: 'tool_result';
  callId: string;
  result: string;
  exitCode?: number;
  error?: string;
  taskId: string;
}

export interface StatusUpdateEvent {
  type: 'status_update';
  status: TaskStatus;
  detail?: string;
  taskId: string;
}

export interface AssistantMessageEvent {
  type: 'message';
  role: 'assistant';
  content: string;
  taskId: string;
}

export interface AgentErrorEvent {
  type: 'error';
  message: string;
  taskId: string;
}

export interface ApprovalRequestEvent {
  type: 'approval_request';
  approvalId: string;
  request: ApprovalPayload;
  taskId: string;
}

export interface PlanUpdateEvent {
  type: 'plan_update';
  steps: PlanStep[];
  taskId: string;
}

export interface ProviderFallbackEvent {
  type: 'provider_fallback';
  fromProvider: string;
  toProvider: string;
  reason: string;
  taskId: string;
}

export interface BrowserScreenshotEvent {
  type: 'browser_screenshot';
  taskId: string;
  callId?: string;
  imageBase64: string;
  width: number;
  height: number;
  byteCount: number;
  timestamp: string;
  source: 'browser_tools' | 'computer_use';
}

export type SSEEvent =
  | ThoughtEvent
  | ToolCallEvent
  | ToolStreamEvent
  | ToolResultEvent
  | StatusUpdateEvent
  | AssistantMessageEvent
  | AgentErrorEvent
  | ApprovalRequestEvent
  | BrowserScreenshotEvent
  | PlanUpdateEvent
  | ProviderFallbackEvent;

export interface ApprovalPayload {
  type:
    | 'shell_exec'
    | 'file_write_outside_workspace'
    | 'file_delete'
    | 'browser_use_actual_chrome'
    | 'risky_browser_action'
    | 'destructive_integration_action';
  command?: string;
  path?: string;
  integration?: string;
  action?: string;
  target?: string;
  reason: string;
}

export type ApprovalDecision = 'approved' | 'denied';

export type ApprovalStatus = ApprovalDecision | 'pending' | 'timeout';

export interface PendingApproval {
  approvalId: string;
  request: ApprovalPayload;
  status: ApprovalStatus;
  taskId: string;
  type: ApprovalPayload['type'];
}

export interface PlanStep {
  id: string;
  title: string;
  state: 'done' | 'active' | 'pending';
  requiresApproval?: boolean;
}

export interface TaskMessage {
  content: string;
  createdAt?: string;
  id: string;
  role: MessageRole;
}

export interface TaskDetailResponse {
  createdAt?: string;
  goal: string;
  id: string;
  messages: TaskMessage[];
  status: TaskStatus;
  updatedAt?: string;
}

export interface CreateTaskRequest {
  goal: string;
  backend?: 'e2b' | 'local';
  providerOverride?: string;
}

export interface CreateTaskResponse {
  taskId: string;
}

export interface HealthResponse {
  service: 'handle-api';
  status: 'ok' | 'starting' | 'degraded';
  build: {
    gitCommit: string;
    builtAt: string;
  };
  timestamp: string;
}
