import { tool } from '@langchain/core/tools';
import type { SideEffectClass } from '@handle/shared';
import type { z } from 'zod';
import type { BrowserSession } from '../execution/browserSession';
import type { E2BSandboxLike, ExecutionBackend } from '../execution/types';
import type { MemoryProjectContext } from '../memory/sessionMemory';

export type ApprovalRequirement = boolean | ((input: unknown, context: ToolExecutionContext) => boolean | Promise<boolean>);

export interface ToolExecutionContext {
  taskId: string;
  backend: ExecutionBackend;
  browserSession?: BrowserSession;
  conversationId?: string;
  memoryContext?: string;
  memoryProject?: MemoryProjectContext | null;
  projectId?: string;
  sandbox: E2BSandboxLike;
  trustedDomains?: string[];
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
  return tool((input: unknown) => definition.implementation(input, context), {
    name: definition.name,
    description: definition.description,
    schema: definition.inputSchema,
  });
}

export function createLangChainTools(definitions: ToolDefinition[], context: ToolExecutionContext) {
  return definitions.map((definition) => createLangChainTool(definition, context));
}
