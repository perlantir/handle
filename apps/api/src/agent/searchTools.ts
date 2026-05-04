import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import {
  parseSearchProviderId,
  webFetch,
  webSearch,
} from "../search/searchProviderService";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

const webSearchInput = z.object({
  maxResults: z.number().int().min(1).max(10).nullable().optional(),
  providerId: z
    .enum(["TAVILY", "SERPER", "BRAVE"])
    .nullable()
    .optional()
    .describe("Optional BYOK provider override. Defaults to project search settings."),
  query: z.string().min(1).describe("Search query."),
});

const webFetchInput = z.object({
  maxBytes: z.number().int().min(1_000).max(500_000).nullable().optional(),
  url: z.string().url().describe("HTTP or HTTPS URL to fetch."),
});

function emitToolCall(
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

function emitToolResult(
  context: ToolExecutionContext,
  callId: string,
  result: string,
  error?: string,
) {
  emitTaskEvent({
    callId,
    ...(error ? { error: redactSecrets(error) } : {}),
    result: redactSecrets(result),
    taskId: context.taskId,
    type: "tool_result",
  });
}

export function createSearchToolDefinitions(): ToolDefinition[] {
  return [
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Search the web with the user's BYOK search providers (Tavily, Serper, Brave). Use for current information and return cited URLs.",
      implementation: async (input, context) => {
        const parsed = webSearchInput.parse(input);
        const callId = emitToolCall(context, "web_search", {
          maxResults: parsed.maxResults ?? 5,
          providerId: parsed.providerId ?? null,
          query: parsed.query,
        });
        if (!context.userId) {
          const message = "web_search requires an authenticated user.";
          emitToolResult(context, callId, "", message);
          throw new Error(message);
        }

        try {
          const providerId = parsed.providerId ? parseSearchProviderId(parsed.providerId) : null;
          const result = await webSearch({
            maxResults: parsed.maxResults ?? 5,
            ...(context.projectId ? { projectId: context.projectId } : {}),
            ...(providerId ? { providerId } : {}),
            query: parsed.query,
            userId: context.userId,
          });
          const output = JSON.stringify(
            {
              providerId: result.providerId,
              results: result.results,
            },
            null,
            2,
          );
          emitToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emitToolResult(context, callId, "", message);
          throw err;
        }
      },
      inputSchema: webSearchInput,
      name: "web_search",
      requiresApproval: false,
      sideEffectClass: "network",
    },
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Fetch a specific HTTP or HTTPS URL and return text content. Use after web_search when a source needs inspection.",
      implementation: async (input, context) => {
        const parsed = webFetchInput.parse(input);
        const callId = emitToolCall(context, "web_fetch", {
          maxBytes: parsed.maxBytes ?? 120_000,
          url: parsed.url,
        });
        try {
          const result = await webFetch({
            maxBytes: parsed.maxBytes ?? 120_000,
            url: parsed.url,
          });
          const output = JSON.stringify(result, null, 2);
          emitToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emitToolResult(context, callId, "", message);
          throw err;
        }
      },
      inputSchema: webFetchInput,
      name: "web_fetch",
      requiresApproval: false,
      sideEffectClass: "network",
    },
  ];
}
