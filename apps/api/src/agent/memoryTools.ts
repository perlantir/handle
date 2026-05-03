import { randomUUID } from "node:crypto";
import { z } from "zod";
import { awaitApproval } from "../approvals/approvalWaiter";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import {
  appendMessageToZep,
  forgetMemoryForProject,
  getRelevantMemoryForTask,
} from "../memory/sessionMemory";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

const saveInput = z.object({
  fact: z.string().min(1).describe("The concise fact or preference to save to memory."),
});

const searchInput = z.object({
  query: z.string().min(1).describe("The memory search query."),
});

const forgetInput = z.object({
  query: z.string().min(1).describe("The memory to forget."),
  scope: z
    .enum(["project", "global", "all"])
    .describe("Which memory namespace to delete. Use project unless the user explicitly asks for global or all memory."),
});

function emitMemoryToolCall(
  context: ToolExecutionContext,
  toolName: string,
  args: Record<string, unknown>,
) {
  const callId = randomUUID();
  emitTaskEvent({
    args,
    callId,
    taskId: context.taskId,
    toolName: displayToolName(toolName),
    type: "tool_call",
  });
  return callId;
}

function emitMemoryToolResult(
  context: ToolExecutionContext,
  callId: string,
  result: string,
  error?: string,
) {
  emitTaskEvent({
    callId,
    result: redactSecrets(result),
    taskId: context.taskId,
    type: "tool_result",
    ...(error ? { error: redactSecrets(error) } : {}),
  });
}

function memoryDisabledMessage() {
  return "Memory is disabled for this project or message.";
}

export function createMemoryToolDefinitions(): ToolDefinition[] {
  return [
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Save a durable user preference, project fact, decision, or idea to Handle memory. Use only for facts worth remembering later.",
      inputSchema: saveInput,
      name: "memory_save",
      requiresApproval: false,
      sideEffectClass: "write",
      async implementation(input, context) {
        const parsed = saveInput.parse(input);
        const callId = emitMemoryToolCall(context, "memory_save", {
          factLength: parsed.fact.length,
        });
        if (!context.memoryProject) {
          const message = memoryDisabledMessage();
          emitMemoryToolResult(context, callId, message);
          return message;
        }

        await appendMessageToZep({
          content: parsed.fact,
          conversationId: context.conversationId,
          project: context.memoryProject,
          role: "USER",
        });
        const result = "Saved memory.";
        emitMemoryToolResult(context, callId, result);
        return result;
      },
    },
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Search Handle memory for relevant remembered facts, user preferences, or project context.",
      inputSchema: searchInput,
      name: "memory_search",
      requiresApproval: false,
      sideEffectClass: "read",
      async implementation(input, context) {
        const parsed = searchInput.parse(input);
        const callId = emitMemoryToolCall(context, "memory_search", {
          query: parsed.query,
        });
        if (!context.memoryProject) {
          const message = memoryDisabledMessage();
          emitMemoryToolResult(context, callId, message);
          return message;
        }

        const facts = await getRelevantMemoryForTask({
          conversationId: context.conversationId,
          goal: parsed.query,
          project: context.memoryProject,
          taskId: context.taskId,
        });
        const result =
          facts.length === 0
            ? "No relevant memory found."
            : JSON.stringify(facts, null, 2);
        emitMemoryToolResult(context, callId, result);
        return result;
      },
    },
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Forget remembered information. This requires approval and currently deletes the selected memory namespace for the active project/global scope.",
      inputSchema: forgetInput,
      name: "memory_forget",
      requiresApproval: true,
      sideEffectClass: "write",
      async implementation(input, context) {
        const parsed = forgetInput.parse(input);
        const callId = emitMemoryToolCall(context, "memory_forget", {
          query: parsed.query,
          scope: parsed.scope,
        });
        if (!context.memoryProject) {
          const message = memoryDisabledMessage();
          emitMemoryToolResult(context, callId, message);
          return message;
        }

        const decision = await awaitApproval(context.taskId, {
          action: "forget",
          reason: `Forget memory matching "${redactSecrets(parsed.query)}" in ${parsed.scope} scope`,
          target: parsed.query,
          type: "memory_forget",
        });
        if (decision !== "approved") {
          const message = `Memory forget ${decision}.`;
          emitMemoryToolResult(context, callId, message, message);
          return message;
        }

        const result = await forgetMemoryForProject({
          project: context.memoryProject,
          scope: parsed.scope,
        });
        const message = `Forgot memory namespace(s): ${result.deletedSessions}.`;
        emitMemoryToolResult(context, callId, message);
        return message;
      },
    },
  ];
}
