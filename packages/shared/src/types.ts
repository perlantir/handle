export type TaskStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'
  | 'STOPPED'
  | 'ERROR'
  | 'PAUSED'
  | 'CANCELLED';

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

export interface AgentRunCancelledEvent {
  type: 'agent_run_cancelled';
  reason: string;
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

export interface MemoryStatusEvent {
  type: 'memory_status';
  taskId: string;
  status: 'online' | 'offline';
  provider: 'self-hosted' | 'cloud';
  detail?: string;
  timestamp: string;
}

export interface MemoryRecallEvent {
  type: 'memory_recall';
  taskId: string;
  facts: Array<{
    content: string;
    invalidAt?: string | null;
    source: 'global' | 'project';
    score?: number;
    validAt?: string | null;
  }>;
  timestamp: string;
}

export interface MemoryFactSummary {
  id: string;
  confidence: number;
  content: string;
  lastUpdated: string;
  invalidAt?: string | null;
  source: 'global' | 'project';
  sourceLabel: string;
  sessionId: string;
  type: string;
  validAt?: string | null;
}

export interface ProcedureTemplateSummary {
  id: string;
  name: string;
  pattern: unknown;
  successRate: number;
  usageCount: number;
  createdFromIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FailurePatternSummary {
  agentRunId: string;
  goal: string;
  outcomeReason?: string | null;
  similarity?: number;
  steps: unknown[];
  createdAt?: string;
}

export type ActionOutcomeType =
  | 'browser_navigated'
  | 'file_created'
  | 'file_deleted'
  | 'file_modified'
  | 'integration_action'
  | 'memory_forgotten'
  | 'memory_saved'
  | 'shell_command_executed';

export interface ActionLogSummary {
  id: string;
  timestamp: string;
  taskId: string;
  conversationId: string;
  projectId: string;
  outcomeType: ActionOutcomeType;
  description: string;
  target: string;
  metadata: Record<string, unknown>;
  reversible: boolean;
  undoCommand?: string;
}

export type SSEEvent =
  | ThoughtEvent
  | ToolCallEvent
  | ToolStreamEvent
  | ToolResultEvent
  | StatusUpdateEvent
  | AssistantMessageEvent
  | AgentErrorEvent
  | AgentRunCancelledEvent
  | ApprovalRequestEvent
  | BrowserScreenshotEvent
  | MemoryRecallEvent
  | MemoryStatusEvent
  | PlanUpdateEvent
  | ProviderFallbackEvent;

export interface ApprovalPayload {
  type:
    | 'shell_exec'
    | 'file_write_outside_workspace'
    | 'file_delete'
    | 'browser_use_actual_chrome'
    | 'risky_browser_action'
    | 'memory_forget'
    | 'destructive_integration_action';
  command?: string;
  path?: string;
  integration?: string;
  action?: string;
  target?: string;
  agentReason?: string;
  reason: string;
}

export type ApprovalDecision = 'approved' | 'denied';

export interface ApprovalResponseRequest {
  approvalId: string;
  alwaysApprove?: boolean;
  decision: ApprovalDecision;
}

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
  backend?: 'e2b' | 'local';
  conversationId?: string;
  createdAt?: string;
  goal: string;
  id: string;
  messages: TaskMessage[];
  conversationTitle?: string | null;
  projectId?: string;
  projectName?: string;
  providerId?: string | null;
  providerModel?: string | null;
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

export type WorkspaceScope = 'DEFAULT_WORKSPACE' | 'CUSTOM_FOLDER' | 'DESKTOP' | 'FULL_ACCESS';

export type ProjectPermissionMode = 'FULL_ACCESS' | 'ASK' | 'PLAN';

export type BackendType = 'E2B' | 'LOCAL';

export type BrowserMode = 'SEPARATE_PROFILE' | 'ACTUAL_CHROME';

export type MemoryScope = 'GLOBAL_AND_PROJECT' | 'PROJECT_ONLY' | 'NONE';

export type SearchProviderId = 'TAVILY' | 'SERPER' | 'BRAVE';

export type SearchProviderStatus = 'configured' | 'missing_key' | 'rate_limited' | 'error';

export interface SearchProviderSummary {
  docsUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  id: SearchProviderId;
  label: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastTestedAt?: string | null;
  memoryScope: MemoryScope;
  rateLimitPerMinute?: number | null;
  status: SearchProviderStatus;
}

export interface ProjectSearchSettingsSummary {
  defaultProvider?: SearchProviderId | null;
  fallbackOrder: Array<SearchProviderId | 'BUILT_IN'>;
  memoryScope: MemoryScope;
  projectId: string;
  updatedAt?: string | null;
}

export interface SearchSettingsResponse {
  project?: ProjectSearchSettingsSummary | null;
  providers: SearchProviderSummary[];
}

export type IntegrationConnectorId =
  | 'gmail'
  | 'slack'
  | 'notion'
  | 'google-drive'
  | 'github'
  | 'google-calendar'
  | 'cloudflare'
  | 'vercel'
  | 'linear'
  | 'google-sheets'
  | 'google-docs'
  | 'zapier'
  | 'obsidian';

export type IntegrationConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'RATE_LIMITED'
  | 'ERROR';

export type IntegrationSetupStatus =
  | 'missing_credentials'
  | 'ready'
  | 'connected'
  | 'reconnect'
  | 'rate_limited'
  | 'error'
  | 'local_vault';

export interface IntegrationConnectorSummary {
  authType: 'local-vault' | 'nango';
  connectorId: IntegrationConnectorId;
  description: string;
  displayName: string;
  docsUrl?: string;
  nangoProviderId: string | null;
  oauthAppUrl?: string;
  requiredScopes: string[];
  setupGuide: string[];
  tier: 1 | 2 | 3;
}

export interface IntegrationConnectorSettingsSummary {
  clientIdConfigured: boolean;
  connectorId: IntegrationConnectorId;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastValidatedAt?: string | null;
  nangoIntegrationId: string | null;
  nangoProviderId: string | null;
  redirectUri: string | null;
  requiredScopes: string[];
  setupStatus: IntegrationSetupStatus;
  updatedAt?: string | null;
}

export interface NangoSettingsSummary {
  configured: boolean;
  host: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastValidatedAt?: string | null;
  updatedAt?: string | null;
}

export interface IntegrationConnectionSummary {
  accountAlias: string;
  accountLabel?: string | null;
  connectorId: IntegrationConnectorId;
  createdAt?: string | null;
  defaultAccount: boolean;
  id: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastHealthCheckAt?: string | null;
  lastUsedAt?: string | null;
  memoryScope: MemoryScope;
  metadata?: Record<string, unknown> | null;
  nangoConnectionId?: string | null;
  nangoIntegrationId?: string | null;
  status: IntegrationConnectionStatus;
  updatedAt?: string | null;
}

export interface IntegrationSettingsResponse {
  connectors: IntegrationConnectorSummary[];
  connections: IntegrationConnectionSummary[];
  connectorSettings: IntegrationConnectorSettingsSummary[];
  nango: NangoSettingsSummary;
}

export type AgentRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ProjectSummary {
  id: string;
  name: string;
  workspaceScope: WorkspaceScope;
  customScopePath?: string | null;
  permissionMode: ProjectPermissionMode;
  memoryScope: MemoryScope;
  defaultBackend: BackendType;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  browserMode: BrowserMode;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationSummary {
  id: string;
  projectId: string;
  title?: string | null;
  latestAgentRunId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  memoryEnabled?: boolean | null;
  agentRunId?: string | null;
  providerId?: string | null;
  modelName?: string | null;
  createdAt?: string;
}

export interface AgentRunSummary {
  id: string;
  conversationId: string;
  status: AgentRunStatus;
  goal: string;
  result?: string | null;
  providerId?: string | null;
  modelName?: string | null;
  backend: BackendType;
  startedAt?: string;
  completedAt?: string | null;
  asyncMode?: boolean;
  workflowId?: string | null;
  workflowRunId?: string | null;
  workflowStatus?: string | null;
  queuedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastNotifiedAt?: string | null;
}

export type NotificationEventType =
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'APPROVAL_NEEDED'
  | 'CRITIC_FLAGGED';

export type NotificationChannel = 'EMAIL' | 'SLACK' | 'WEBHOOK';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface TemporalSettingsSummary {
  enabled: boolean;
  address: string;
  namespace: string;
  taskQueue: string;
  health: {
    checkedAt?: string | null;
    detail?: string | null;
    status: 'online' | 'offline' | 'unknown';
  };
  updatedAt?: string | null;
}

export interface NotificationSettingsSummary {
  emailEnabled: boolean;
  emailRecipient?: string | null;
  slackEnabled: boolean;
  slackChannelId?: string | null;
  webhookEnabled: boolean;
  webhookUrl?: string | null;
  eventTypes: NotificationEventType[];
  updatedAt?: string | null;
}

export interface ProjectNotificationSettingsSummary {
  projectId: string;
  inheritGlobal: boolean;
  emailEnabled?: boolean | null;
  emailRecipient?: string | null;
  slackEnabled?: boolean | null;
  slackChannelId?: string | null;
  webhookEnabled?: boolean | null;
  webhookUrl?: string | null;
  eventTypes?: NotificationEventType[] | null;
  updatedAt?: string | null;
}

export interface AsyncTaskSummary {
  id: string;
  conversationId: string;
  projectId?: string | null;
  projectName?: string | null;
  goal: string;
  status: AgentRunStatus;
  asyncMode: boolean;
  workflowId?: string | null;
  workflowRunId?: string | null;
  workflowStatus?: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastNotifiedAt?: string | null;
}

export interface NotificationDeliverySummary {
  id: string;
  userId: string;
  projectId?: string | null;
  agentRunId?: string | null;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  dispatchedAt?: string | null;
  createdAt?: string | null;
}

export interface SendConversationMessageResponse {
  agentRunId: string;
  cancelledRunId?: string;
  conversationId: string;
  messageId: string;
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
