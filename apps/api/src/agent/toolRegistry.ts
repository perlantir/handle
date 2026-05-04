import { tool } from '@langchain/core/tools';
import type { SideEffectClass } from '@handle/shared';
import type { z } from 'zod';
import type { BrowserSession } from '../execution/browserSession';
import type { E2BSandboxLike, ExecutionBackend } from '../execution/types';
import type { IntegrationToolRuntime } from '../integrations/toolRuntime';
import type { MemoryProjectContext } from '../memory/sessionMemory';
import type { TrajectoryStepRecord } from '../memory/trajectoryMemory';
import type { awaitApproval } from '../approvals/approvalWaiter';

export type ApprovalRequirement = boolean | ((input: unknown, context: ToolExecutionContext) => boolean | Promise<boolean>);

export interface ToolExecutionContext {
  taskId: string;
  backend: ExecutionBackend;
  browserSession?: BrowserSession;
  conversationId?: string;
  integrationRuntime?: IntegrationToolRuntime;
  memoryContext?: string;
  memoryProject?: MemoryProjectContext | null;
  projectId?: string;
  projectPermissionMode?: 'ASK' | 'FULL_ACCESS' | 'PLAN' | string | null;
  recordTrajectoryStep?: (step: TrajectoryStepRecord) => Promise<void>;
  requestApproval?: typeof awaitApproval;
  sandbox: E2BSandboxLike;
  sharedMemoryNamespaceId?: string;
  trustedDomains?: string[];
  userId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.AnyZodObject;
  sideEffectClass: SideEffectClass;
  requiresApproval: ApprovalRequirement;
  backendSupport: {
    e2b: boolean;
    local: boolean;
  };
  implementation: (input: unknown, context: ToolExecutionContext) => Promise<string>;
}

export function displayToolName(toolName: string) {
  return toolName.replace('_', '.');
}

export function createLangChainTool(definition: ToolDefinition, context: ToolExecutionContext) {
  return tool(async (input: unknown) => {
    const startedAt = new Date();
    const started = Date.now();
    try {
      const output = await definition.implementation(input, context);
      await context.recordTrajectoryStep?.({
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        startedAt: startedAt.toISOString(),
        status: 'success',
        subgoal: `Use ${displayToolName(definition.name)}`,
        toolInput: input,
        toolName: definition.name,
        toolOutput: output,
      });
      return output;
    } catch (err) {
      await context.recordTrajectoryStep?.({
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        errorReason: err instanceof Error ? err.message : String(err),
        startedAt: startedAt.toISOString(),
        status: 'tool_error',
        subgoal: `Use ${displayToolName(definition.name)}`,
        toolInput: input,
        toolName: definition.name,
        toolOutput: null,
      });
      throw err;
    }
  }, {
    name: definition.name,
    description: definition.description,
    schema: definition.inputSchema,
  });
}

export function createLangChainTools(definitions: ToolDefinition[], context: ToolExecutionContext) {
  return definitions.map((definition) => createLangChainTool(definition, context));
}
