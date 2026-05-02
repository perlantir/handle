import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from './toolRegistry';
import { displayToolName } from './toolRegistry';
import { emitTaskEvent } from '../lib/eventBus';
import { redactSecrets } from '../lib/redact';

const shellExecInput = z.object({
  command: z.string().min(1).describe('The bash command to run'),
});

const fileWriteInput = z.object({
  path: z.string().min(1).describe('Absolute path to write'),
  content: z.string().describe('File content'),
});

const fileReadInput = z.object({
  path: z.string().min(1).describe('Absolute path to read'),
});

const fileListInput = z.object({
  path: z.string().min(1).describe('Absolute path to list'),
});

function emitToolCall(context: ToolExecutionContext, toolName: string, args: Record<string, unknown>) {
  const callId = randomUUID();

  emitTaskEvent({
    type: 'tool_call',
    toolName: displayToolName(toolName),
    args,
    callId,
    taskId: context.taskId,
  });

  return callId;
}

function emitToolResult(context: ToolExecutionContext, callId: string, result: string, exitCode?: number, error?: string) {
  emitTaskEvent({
    type: 'tool_result',
    callId,
    result: redactSecrets(result),
    taskId: context.taskId,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(error ? { error: redactSecrets(error) } : {}),
  });
}

export function createPhase1ToolDefinitions(): ToolDefinition[] {
  const shellExec: ToolDefinition = {
    name: 'shell_exec',
    description: 'Execute a bash command in the active execution backend. Streams stdout/stderr in real time.',
    inputSchema: shellExecInput,
    sideEffectClass: 'execute',
    requiresApproval: false,
    backendSupport: { e2b: true, local: true },
    async implementation(input, context) {
      const parsed = shellExecInput.parse(input);
      const callId = emitToolCall(context, 'shell_exec', parsed);

      try {
        const result = await context.backend.shellExec(parsed.command, {
          onStderr(data) {
            emitTaskEvent({
              type: 'tool_stream',
              callId,
              channel: 'stderr',
              content: redactSecrets(data),
              taskId: context.taskId,
            });
          },
          onStdout(data) {
            emitTaskEvent({
              type: 'tool_stream',
              callId,
              channel: 'stdout',
              content: redactSecrets(data),
              taskId: context.taskId,
            });
          },
        });
        const output = JSON.stringify({
          exitCode: result.exitCode,
          stderr: redactSecrets(result.stderr),
          stdout: redactSecrets(result.stdout),
        });

        emitToolResult(context, callId, output, result.exitCode);
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitToolResult(context, callId, '', undefined, message);
        throw err;
      }
    },
  };

  const fileWrite: ToolDefinition = {
    name: 'file_write',
    description: 'Write content to a file in the active execution backend.',
    inputSchema: fileWriteInput,
    sideEffectClass: 'write',
    requiresApproval: false,
    backendSupport: { e2b: true, local: true },
    async implementation(input, context) {
      const parsed = fileWriteInput.parse(input);
      const callId = emitToolCall(context, 'file_write', {
        contentLength: parsed.content.length,
        path: parsed.path,
      });

      try {
        await context.backend.fileWrite(parsed.path, parsed.content);
        const result = `Wrote ${parsed.content.length} bytes to ${parsed.path}`;
        emitToolResult(context, callId, result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitToolResult(context, callId, '', undefined, message);
        throw err;
      }
    },
  };

  const fileRead: ToolDefinition = {
    name: 'file_read',
    description: 'Read the contents of a file in the active execution backend.',
    inputSchema: fileReadInput,
    sideEffectClass: 'read',
    requiresApproval: false,
    backendSupport: { e2b: true, local: true },
    async implementation(input, context) {
      const parsed = fileReadInput.parse(input);
      const callId = emitToolCall(context, 'file_read', parsed);

      try {
        const content = await context.backend.fileRead(parsed.path);
        const redacted = redactSecrets(content);
        emitToolResult(context, callId, redacted);
        return redacted;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitToolResult(context, callId, '', undefined, message);
        throw err;
      }
    },
  };

  const fileList: ToolDefinition = {
    name: 'file_list',
    description: 'List files and directories at a path in the active execution backend.',
    inputSchema: fileListInput,
    sideEffectClass: 'read',
    requiresApproval: false,
    backendSupport: { e2b: true, local: true },
    async implementation(input, context) {
      const parsed = fileListInput.parse(input);
      const callId = emitToolCall(context, 'file_list', parsed);

      try {
        const entries = await context.backend.fileList(parsed.path);
        const result = redactSecrets(JSON.stringify(entries, null, 2));
        emitToolResult(context, callId, result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitToolResult(context, callId, '', undefined, message);
        throw err;
      }
    },
  };

  return [shellExec, fileWrite, fileRead, fileList];
}
