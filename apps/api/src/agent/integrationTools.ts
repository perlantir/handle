import { randomUUID } from "node:crypto";
import type { IntegrationConnectorId } from "@handle/shared";
import { z } from "zod";
import { IntegrationError } from "../integrations/nango/errors";
import {
  createDefaultIntegrationToolRuntime,
  type IntegrationToolRuntime,
} from "../integrations/toolRuntime";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

type Method = "GET" | "POST";

interface ProviderRequestSpec<T extends z.AnyZodObject> {
  connectorId: IntegrationConnectorId;
  description: string;
  inputSchema: T;
  method?: Method;
  name: string;
  request(input: z.infer<T>): {
    data?: unknown;
    endpoint: string;
    params?: Record<string, unknown>;
  };
}

const accountAlias = z
  .string()
  .min(1)
  .max(80)
  .nullable()
  .optional()
  .describe("Optional connected account alias. Defaults to the connector default account.");

const maxResults = z.number().int().min(1).max(50).nullable().optional();

const gmailSearchInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1).describe("Gmail search query."),
});

const gmailMessageInput = z.object({
  accountAlias,
  messageId: z.string().min(1),
});

const gmailThreadInput = z.object({
  accountAlias,
  threadId: z.string().min(1),
});

const labelsInput = z.object({ accountAlias });

const slackSearchInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1),
});

const slackChannelsInput = z.object({
  accountAlias,
  maxResults,
  types: z
    .string()
    .nullable()
    .optional()
    .describe("Slack conversation types, comma-separated."),
});

const slackDmInput = z.object({
  accountAlias,
  channelId: z.string().min(1).describe("Slack DM or conversation channel ID."),
  maxResults,
});

const notionSearchInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1),
});

const notionPageInput = z.object({
  accountAlias,
  pageId: z.string().min(1),
});

const driveSearchInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1),
});

const driveFileInput = z.object({
  accountAlias,
  fileId: z.string().min(1),
});

const driveExportInput = z.object({
  accountAlias,
  fileId: z.string().min(1),
  mimeType: z.string().min(1).nullable().optional(),
});

const githubRepoInput = z.object({
  accountAlias,
  owner: z.string().min(1).nullable().optional(),
  repo: z.string().min(1).nullable().optional(),
  state: z.enum(["open", "closed", "all"]).nullable().optional(),
});

const githubIssueInput = z.object({
  accountAlias,
  issueNumber: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const githubCodeSearchInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1),
});

const executeInput = z.object({
  accountAlias,
  instruction: z.string().min(1),
});

const WRITE_VERB_PATTERN =
  /\b(send|create|update|delete|remove|archive|reply|post|upload|copy|share|invite|merge|close|reopen|assign|label|comment|write)\b/i;

let defaultRuntime: IntegrationToolRuntime | null = null;

function runtimeFor(context: ToolExecutionContext) {
  if (context.integrationRuntime) return context.integrationRuntime;
  defaultRuntime ??= createDefaultIntegrationToolRuntime();
  return defaultRuntime;
}

function requireUserId(context: ToolExecutionContext) {
  if (context.userId) return context.userId;
  throw new IntegrationError({
    code: "validation_error",
    message:
      "Integration tools need an authenticated user context. Start this run from the workspace chat.",
  });
}

function emitIntegrationToolCall(
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

function emitIntegrationToolResult(
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

function createReadTool<T extends z.AnyZodObject>(
  spec: ProviderRequestSpec<T>,
): ToolDefinition {
  return {
    backendSupport: { e2b: true, local: true },
    description: spec.description,
    inputSchema: spec.inputSchema,
    name: spec.name,
    requiresApproval: false,
    sideEffectClass: "read",
    async implementation(input, context) {
      const parsed = spec.inputSchema.parse(input);
      const accountAlias = "accountAlias" in parsed ? parsed.accountAlias : undefined;
      const request = spec.request(parsed);
      const callId = emitIntegrationToolCall(context, spec.name, {
        ...(accountAlias ? { accountAlias } : {}),
        endpoint: request.endpoint,
      });
      try {
        const response = await runtimeFor(context).request({
          ...(accountAlias ? { accountAlias } : {}),
          connectorId: spec.connectorId,
          ...(request.data !== undefined ? { data: request.data } : {}),
          endpoint: request.endpoint,
          method: spec.method ?? "GET",
          ...(request.params ? { params: request.params } : {}),
          userId: requireUserId(context),
        });
        const output = formatProviderResponse(response.data);
        emitIntegrationToolResult(context, callId, output);
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitIntegrationToolResult(context, callId, "", message);
        throw err;
      }
    },
  };
}

function createExecuteTool(
  connectorId: IntegrationConnectorId,
  name: string,
  displayName: string,
): ToolDefinition {
  return {
    backendSupport: { e2b: true, local: true },
    description: `Natural-language ${displayName} integration fallback. In Stage 2, read actions should use explicit ${displayName} read tools and write actions are not enabled.`,
    inputSchema: executeInput,
    name,
    requiresApproval: false,
    sideEffectClass: "read",
    async implementation(input, context) {
      const parsed = executeInput.parse(input);
      const callId = emitIntegrationToolCall(context, name, {
        accountAlias: parsed.accountAlias,
        instruction: parsed.instruction,
      });
      const message = WRITE_VERB_PATTERN.test(parsed.instruction)
        ? `${displayName} write actions are not enabled until Phase 6 Stage 3. Use the explicit read tools for read-only requests.`
        : `${displayName} execute is read-only in Stage 2. Use the explicit ${connectorId} read tools for deterministic access.`;
      emitIntegrationToolResult(context, callId, message);
      return message;
    },
  };
}

function formatProviderResponse(data: unknown) {
  return truncate(JSON.stringify(redactSecretsInUnknown(data), null, 2), 16_000);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}\n... [truncated ${value.length - maxLength} chars]`;
}

function redactSecretsInUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactSecretsInUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecretsInUnknown(item)]),
    );
  }
  return value;
}

function optionalLimit(value: number | null | undefined, fallback: number) {
  return value ?? fallback;
}

function repoEndpoint(
  input: { owner?: string | null | undefined; repo?: string | null | undefined },
  suffix: string,
) {
  return input.owner && input.repo ? `/repos/${input.owner}/${input.repo}${suffix}` : suffix;
}

export function createTier1IntegrationToolDefinitions(): ToolDefinition[] {
  return [
    createReadTool({
      connectorId: "gmail",
      description: "Search Gmail messages. Read-only; does not send, archive, or modify email.",
      inputSchema: gmailSearchInput,
      name: "gmail_search",
      request: (input) => ({
        endpoint: "/gmail/v1/users/me/messages",
        params: {
          maxResults: optionalLimit(input.maxResults, 10),
          q: input.query,
        },
      }),
    }),
    createReadTool({
      connectorId: "gmail",
      description: "Read one Gmail message by message ID.",
      inputSchema: gmailMessageInput,
      name: "gmail_get_message",
      request: (input) => ({
        endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`,
        params: { format: "full" },
      }),
    }),
    createReadTool({
      connectorId: "gmail",
      description: "Read one Gmail thread by thread ID.",
      inputSchema: gmailThreadInput,
      name: "gmail_get_thread",
      request: (input) => ({
        endpoint: `/gmail/v1/users/me/threads/${encodeURIComponent(input.threadId)}`,
        params: { format: "full" },
      }),
    }),
    createReadTool({
      connectorId: "gmail",
      description: "List Gmail labels.",
      inputSchema: labelsInput,
      name: "gmail_list_labels",
      request: () => ({ endpoint: "/gmail/v1/users/me/labels" }),
    }),
    createExecuteTool("gmail", "gmail_execute", "Gmail"),

    createReadTool({
      connectorId: "slack",
      description: "Search Slack messages. Read-only.",
      inputSchema: slackSearchInput,
      name: "slack_search",
      request: (input) => ({
        endpoint: "/api/search.messages",
        params: {
          count: optionalLimit(input.maxResults, 10),
          query: input.query,
        },
      }),
    }),
    createReadTool({
      connectorId: "slack",
      description: "List Slack channels/conversations.",
      inputSchema: slackChannelsInput,
      name: "slack_list_channels",
      request: (input) => ({
        endpoint: "/api/conversations.list",
        params: {
          limit: optionalLimit(input.maxResults, 20),
          types: input.types ?? "public_channel,private_channel",
        },
      }),
    }),
    createReadTool({
      connectorId: "slack",
      description: "Read Slack DM or conversation history.",
      inputSchema: slackDmInput,
      name: "slack_read_dms",
      request: (input) => ({
        endpoint: "/api/conversations.history",
        params: {
          channel: input.channelId,
          limit: optionalLimit(input.maxResults, 20),
        },
      }),
    }),
    createExecuteTool("slack", "slack_execute", "Slack"),

    createReadTool({
      connectorId: "notion",
      description: "Search Notion pages and databases.",
      inputSchema: notionSearchInput,
      method: "POST",
      name: "notion_search",
      request: (input) => ({
        data: { page_size: optionalLimit(input.maxResults, 10), query: input.query },
        endpoint: "/v1/search",
      }),
    }),
    createReadTool({
      connectorId: "notion",
      description: "Read Notion page metadata and properties by page ID.",
      inputSchema: notionPageInput,
      name: "notion_get_page",
      request: (input) => ({
        endpoint: `/v1/pages/${encodeURIComponent(input.pageId)}`,
      }),
    }),
    createReadTool({
      connectorId: "notion",
      description: "List Notion databases by searching database objects.",
      inputSchema: z.object({ accountAlias, maxResults }),
      method: "POST",
      name: "notion_list_databases",
      request: (input) => ({
        data: {
          filter: { property: "object", value: "database" },
          page_size: optionalLimit(input.maxResults, 20),
        },
        endpoint: "/v1/search",
      }),
    }),
    createExecuteTool("notion", "notion_execute", "Notion"),

    createReadTool({
      connectorId: "google-drive",
      description: "Search Google Drive files by query.",
      inputSchema: driveSearchInput,
      name: "drive_search",
      request: (input) => ({
        endpoint: "/drive/v3/files",
        params: {
          fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
          pageSize: optionalLimit(input.maxResults, 10),
          q: input.query,
        },
      }),
    }),
    createReadTool({
      connectorId: "google-drive",
      description: "Get Google Drive file metadata.",
      inputSchema: driveFileInput,
      name: "drive_get_file",
      request: (input) => ({
        endpoint: `/drive/v3/files/${encodeURIComponent(input.fileId)}`,
        params: { fields: "id,name,mimeType,modifiedTime,size,webViewLink,owners" },
      }),
    }),
    createReadTool({
      connectorId: "google-drive",
      description: "Export a Google Drive file to a requested mime type.",
      inputSchema: driveExportInput,
      name: "drive_export",
      request: (input) => ({
        endpoint: `/drive/v3/files/${encodeURIComponent(input.fileId)}/export`,
        params: { mimeType: input.mimeType ?? "text/plain" },
      }),
    }),
    createExecuteTool("google-drive", "drive_execute", "Google Drive"),

    createReadTool({
      connectorId: "github",
      description:
        "List GitHub issues. If owner/repo are omitted, lists issues visible to the authenticated account.",
      inputSchema: githubRepoInput,
      name: "github_list_issues",
      request: (input) => ({
        endpoint: repoEndpoint(input, input.owner && input.repo ? "/issues" : "/issues"),
        params: { state: input.state ?? "open" },
      }),
    }),
    createReadTool({
      connectorId: "github",
      description: "Read one GitHub issue by repository and issue number.",
      inputSchema: githubIssueInput,
      name: "github_get_issue",
      request: (input) => ({
        endpoint: `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}`,
      }),
    }),
    createReadTool({
      connectorId: "github",
      description: "Search GitHub code using GitHub's code search syntax.",
      inputSchema: githubCodeSearchInput,
      name: "github_search_code",
      request: (input) => ({
        endpoint: "/search/code",
        params: { per_page: optionalLimit(input.maxResults, 10), q: input.query },
      }),
    }),
    createReadTool({
      connectorId: "github",
      description: "List GitHub pull requests for a repository.",
      inputSchema: githubRepoInput.extend({
        owner: z.string().min(1),
        repo: z.string().min(1),
      }),
      name: "github_list_pull_requests",
      request: (input) => ({
        endpoint: `/repos/${input.owner}/${input.repo}/pulls`,
        params: { state: input.state ?? "open" },
      }),
    }),
    createExecuteTool("github", "github_execute", "GitHub"),
  ];
}
