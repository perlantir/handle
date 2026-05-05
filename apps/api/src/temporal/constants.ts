export const DEFAULT_TEMPORAL_ADDRESS = "127.0.0.1:7233";
export const DEFAULT_TEMPORAL_NAMESPACE = "default";
export const DEFAULT_TEMPORAL_TASK_QUEUE = "handle-agent-runs";

export interface TemporalRuntimeSettings {
  address: string;
  enabled: boolean;
  namespace: string;
  taskQueue: string;
}

export interface AgentRunWorkflowInput {
  agentRunId: string;
  goal: string;
  options?: {
    backend?: "e2b" | "local";
    providerOverride?: string;
  };
}

export interface SkillRunWorkflowInput {
  scheduleId?: string;
  skillId?: string;
  userId: string;
  inputs?: Record<string, unknown>;
  projectId?: string;
  trigger?: "SCHEDULED" | "WORKFLOW";
}

export interface ScheduledRunWorkflowInput {
  scheduleId: string;
  userId?: string;
}
