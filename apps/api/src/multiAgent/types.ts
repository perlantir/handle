import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type {
  AgentExecutionMode,
  AgentSpecialistRole,
  CriticVerdict,
  MultiAgentTraceEvent,
} from "@handle/shared";
import type { ActiveProviderModel, ProviderId } from "../providers/types";

export type SpecialistId =
  | "analyst"
  | "coder"
  | "designer"
  | "operator"
  | "researcher"
  | "supervisor"
  | "synthesizer"
  | "verifier"
  | "writer";

export type AgentRunMode = AgentExecutionMode;

export type SpecialistStatus = "completed" | "failed" | "blocked" | "revised";

export interface ToolPolicy {
  allowedToolPrefixes: string[];
  deniedToolPrefixes: string[];
  requiresApprovalFor: string[];
}

export interface RuntimePolicy {
  maxIterations: number;
  maxToolCalls: number;
  requiresVerifier: boolean;
}

export interface ApprovalPolicy {
  destructiveRequiresApproval: boolean;
  externalWriteRequiresApproval: boolean;
  highRiskVoiceApprovalRequiresCode: boolean;
}

export interface SpecialistDefinition {
  description: string;
  id: SpecialistId;
  label: string;
  role: AgentSpecialistRole;
  runtimePolicy: RuntimePolicy;
  selectable: boolean;
  suggestedModel?: string;
  toolPolicy: ToolPolicy;
}

export interface AgentRunBudgets {
  maxCostCents: number;
  maxParallelSubRuns: number;
  maxRevisionLoops: number;
  maxRuntimeSeconds: number;
  maxSpecialistSubRuns: number;
  maxSupervisorTurns: number;
  maxToolCalls: number;
}

export interface BudgetSnapshot extends AgentRunBudgets {
  costCents: number;
  runtimeSeconds: number;
  specialistSubRuns: number;
  supervisorTurns: number;
  toolCalls: number;
  warningsEmitted: string[];
}

export interface SpecialistAssignment {
  goal: string;
  id: string;
  rationale: string;
  role: AgentSpecialistRole;
  specialistId: SpecialistId;
}

export interface SourceReference {
  accessedAt: string;
  domain: string;
  publishedAt?: string | null;
  snippet?: string;
  title: string;
  url: string;
}

export interface SpecialistArtifact {
  content: string;
  kind: "analysis" | "code_review" | "design_review" | "draft" | "operation_plan" | "research_report" | "verification";
  mimeType: "application/json" | "text/markdown" | "text/plain";
  title: string;
}

export interface SpecialistReport {
  artifactIds: string[];
  artifacts: SpecialistArtifact[];
  blockers: string[];
  costCents: number;
  findings: string[];
  recommendations: string[];
  role: AgentSpecialistRole;
  safeSummary: string;
  sources: SourceReference[];
  status: SpecialistStatus;
  toolCallCount: number;
}

export interface SupervisorDecision {
  assignments: SpecialistAssignment[];
  mode: AgentExecutionMode;
  reason: string;
  verifierRequired: boolean;
}

export interface VerificationResult {
  revisionNotes: string[];
  safeSummary: string;
  verdict: CriticVerdict;
}

export interface MultiAgentState {
  agentRunId: string;
  approvalIds: string[];
  artifactIds: string[];
  assignments: SpecialistAssignment[];
  budgets: BudgetSnapshot;
  completedReports: SpecialistReport[];
  currentGoal: string;
  error?: string;
  mode: AgentExecutionMode;
  originalGoal: string;
  plan: string[];
  sourceIds: string[];
  status: "cancelled" | "completed" | "failed" | "planning" | "running" | "waiting";
  taskId: string;
  traceEventIds: string[];
  userId?: string | null;
}

export interface MultiAgentProjectContext {
  agentExecutionMode?: string | null;
  criticEnabled?: boolean | null;
  criticScope?: string | null;
  defaultModel?: string | null;
  defaultProvider?: string | null;
  id?: string | null;
  maxCostCents?: number | null;
  maxParallelSubRuns?: number | null;
  maxRevisionLoops?: number | null;
  maxRuntimeSeconds?: number | null;
  maxSpecialistSubRuns?: number | null;
  maxSupervisorTurns?: number | null;
  maxToolCalls?: number | null;
}

export interface AgentSubRunDelegate {
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<unknown>;
  findMany?(args: unknown): Promise<unknown[]>;
}

export interface AgentHandoffDelegate {
  create(args: unknown): Promise<{ id: string }>;
  findMany?(args: unknown): Promise<unknown[]>;
  update(args: unknown): Promise<unknown>;
}

export interface AgentRunDelegate {
  create?(args: unknown): Promise<{ id: string }>;
  findMany?(args: unknown): Promise<unknown[]>;
  findFirst?(args: unknown): Promise<unknown | null>;
  findUnique?(args: unknown): Promise<unknown | null>;
  update(args: unknown): Promise<unknown>;
}

export interface MultiAgentStore {
  agentHandoff?: AgentHandoffDelegate;
  agentRun?: AgentRunDelegate;
  agentSubRun?: AgentSubRunDelegate;
}

export interface MultiAgentRuntimeContext {
  emitEvent: (event: MultiAgentTraceEvent) => void;
  goal: string;
  modelOverride?: string;
  project?: MultiAgentProjectContext | null;
  providerRegistry: {
    getActiveModel(args?: {
      modelOverride?: string;
      taskId?: string;
      taskOverride?: ProviderId;
    }): Promise<ActiveProviderModel>;
    initialize?(): Promise<void>;
  };
  store: MultiAgentStore;
  taskId: string;
  userId?: string | null;
}

export interface SpecialistExecutionContext extends MultiAgentRuntimeContext {
  assignment: SpecialistAssignment;
  budget: BudgetSnapshot;
  definition: SpecialistDefinition;
  effectiveApprovalPolicy: ApprovalPolicy;
  effectiveRuntimePolicy: RuntimePolicy;
  effectiveToolPolicy: ToolPolicy;
  llm: BaseChatModel;
  providerId: ProviderId;
}

export interface MultiAgentRunSummary {
  budget: AgentRunBudgets;
  contextSummary: string;
  finalResponse?: string;
  primaryRole: AgentSpecialistRole;
  reports: SpecialistReport[];
  roles: AgentSpecialistRole[];
  teamMode: boolean;
  verifierRequired: boolean;
}
