import { randomUUID } from "node:crypto";
import type { ApprovalPayload, IntegrationConnectorId } from "@handle/shared";
import { z } from "zod";
import { hasApprovalGrant } from "../approvals/approvalGrants";
import { awaitApproval } from "../approvals/approvalWaiter";
import { IntegrationError } from "../integrations/nango/errors";
import {
  createDefaultIntegrationToolRuntime,
  type IntegrationToolRuntime,
} from "../integrations/toolRuntime";
import { appendActionLog } from "../lib/actionLog";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

type Method = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

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

const agentReason = z
  .string()
  .min(1)
  .max(500)
  .nullable()
  .optional()
  .describe("Optional concise reason to show the user in the approval modal.");

const gmailSendInput = z.object({
  accountAlias,
  agentReason,
  bcc: z.array(z.string().email()).max(20).nullable().optional(),
  body: z.string().min(1).max(100_000),
  cc: z.array(z.string().email()).max(20).nullable().optional(),
  subject: z.string().min(1).max(500),
  to: z.array(z.string().email()).min(1).max(20),
});

const slackSendInput = z.object({
  accountAlias,
  agentReason,
  channelId: z.string().min(1),
  text: z.string().min(1).max(40_000),
});

const notionCreatePageInput = z.object({
  accountAlias,
  agentReason,
  content: z.string().max(20_000).nullable().optional(),
  databaseId: z.string().min(1).nullable().optional(),
  parentPageId: z.string().min(1).nullable().optional(),
  title: z.string().min(1).max(500),
});

const notionUpdatePageInput = z.object({
  accountAlias,
  agentReason,
  pageId: z.string().min(1),
  patch: z.record(z.unknown()).describe("Notion page patch body."),
});

const driveCreateFileInput = z.object({
  accountAlias,
  agentReason,
  mimeType: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(500),
  parents: z.array(z.string().min(1)).max(10).nullable().optional(),
});

const driveCopyFileInput = z.object({
  accountAlias,
  agentReason,
  fileId: z.string().min(1),
  name: z.string().min(1).max(500).nullable().optional(),
  parents: z.array(z.string().min(1)).max(10).nullable().optional(),
});

const githubCreateIssueInput = z.object({
  accountAlias,
  agentReason,
  body: z.string().max(65_000).nullable().optional(),
  labels: z.array(z.string().min(1)).max(20).nullable().optional(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1).max(500),
});

const githubCommentIssueInput = z.object({
  accountAlias,
  agentReason,
  body: z.string().min(1).max(65_000),
  issueNumber: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const githubUpdateIssueInput = z.object({
  accountAlias,
  agentReason,
  issueNumber: z.number().int().positive(),
  owner: z.string().min(1),
  patch: z.record(z.unknown()),
  repo: z.string().min(1),
});

const githubCreatePullRequestInput = z.object({
  accountAlias,
  agentReason,
  base: z.string().min(1),
  body: z.string().max(65_000).nullable().optional(),
  draft: z.boolean().nullable().optional(),
  head: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1).max(500),
});

const calendarListInput = z.object({ accountAlias });
const calendarEventsInput = z.object({
  accountAlias,
  calendarId: z.string().min(1).nullable().optional(),
  maxResults,
  query: z.string().min(1).nullable().optional(),
  timeMax: z.string().datetime().nullable().optional(),
  timeMin: z.string().datetime().nullable().optional(),
});
const calendarEventInput = z.object({
  accountAlias,
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
});
const calendarCreateEventInput = z.object({
  accountAlias,
  agentReason,
  attendees: z.array(z.string().email()).max(20).nullable().optional(),
  calendarId: z.string().min(1).nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  end: z.string().datetime(),
  location: z.string().max(500).nullable().optional(),
  start: z.string().datetime(),
  title: z.string().min(1).max(500),
});
const calendarUpdateEventInput = z.object({
  accountAlias,
  agentReason,
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
  patch: z.record(z.unknown()),
});
const calendarDeleteEventInput = z.object({
  accountAlias,
  agentReason,
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
});

const cloudflareAccountInput = z.object({ accountAlias });
const cloudflareDnsInput = z.object({
  accountAlias,
  zoneId: z.string().min(1),
});
const cloudflarePagesInput = z.object({
  accountAlias,
  accountId: z.string().min(1),
  projectName: z.string().min(1),
});
const cloudflareUpdateDnsInput = z.object({
  accountAlias,
  agentReason,
  patch: z.record(z.unknown()),
  recordId: z.string().min(1),
  zoneId: z.string().min(1),
});
const cloudflareCreateDnsInput = z.object({
  accountAlias,
  agentReason,
  record: z.record(z.unknown()),
  zoneId: z.string().min(1),
});
const cloudflarePurgeCacheInput = z.object({
  accountAlias,
  agentReason,
  files: z.array(z.string().url()).max(100).nullable().optional(),
  purgeEverything: z.boolean().nullable().optional(),
  zoneId: z.string().min(1),
});
const cloudflareDeployPagesInput = z.object({
  accountAlias,
  accountId: z.string().min(1),
  agentReason,
  projectName: z.string().min(1),
  source: z.record(z.unknown()).nullable().optional(),
});

const vercelProjectsInput = z.object({
  accountAlias,
  teamId: z.string().min(1).nullable().optional(),
});
const vercelDeploymentsInput = z.object({
  accountAlias,
  projectId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
});
const vercelDeploymentLogsInput = z.object({
  accountAlias,
  deploymentId: z.string().min(1),
});
const vercelProjectInput = z.object({
  accountAlias,
  projectIdOrName: z.string().min(1),
  teamId: z.string().min(1).nullable().optional(),
});
const vercelCreateDeploymentInput = z.object({
  accountAlias,
  agentReason,
  projectIdOrName: z.string().min(1),
  ref: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
});
const vercelDeploymentActionInput = z.object({
  accountAlias,
  agentReason,
  deploymentId: z.string().min(1),
});
const vercelRollbackInput = z.object({
  accountAlias,
  agentReason,
  deploymentId: z.string().min(1),
  projectIdOrName: z.string().min(1),
});

const linearSearchIssuesInput = z.object({
  accountAlias,
  maxResults,
  query: z.string().min(1),
  teamId: z.string().min(1).nullable().optional(),
});
const linearIssueInput = z.object({
  accountAlias,
  issueIdOrKey: z.string().min(1),
});
const linearListInput = z.object({
  accountAlias,
  teamId: z.string().min(1).nullable().optional(),
});
const linearCreateIssueInput = z.object({
  accountAlias,
  agentReason,
  assigneeId: z.string().min(1).nullable().optional(),
  description: z.string().max(65_000).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1),
  title: z.string().min(1).max(500),
});
const linearUpdateIssueInput = z.object({
  accountAlias,
  agentReason,
  issueId: z.string().min(1),
  patch: z.record(z.unknown()),
});
const linearCommentIssueInput = z.object({
  accountAlias,
  agentReason,
  body: z.string().min(1).max(65_000),
  issueId: z.string().min(1),
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

function actionContext(context: ToolExecutionContext) {
  return {
    conversationId: context.conversationId ?? context.taskId,
    projectId: context.projectId ?? context.memoryProject?.id ?? "unknown",
    taskId: context.taskId,
  };
}

function isFullAccess(context: ToolExecutionContext) {
  return context.projectPermissionMode === "FULL_ACCESS";
}

async function ensureIntegrationApproval({
  action,
  agentReason,
  context,
  destructive = false,
  displayName,
  target,
}: {
  action: string;
  agentReason?: string | null;
  context: ToolExecutionContext;
  destructive?: boolean;
  displayName: string;
  target: string;
}) {
  if (!destructive && isFullAccess(context)) return { approved: true as const };

  const request: ApprovalPayload = {
    action,
    integration: displayName,
    reason: `${displayName} wants to ${action} ${target}.`,
    target,
    type: "destructive_integration_action",
  };
  if (agentReason) request.agentReason = agentReason;
  if (
    hasApprovalGrant(
      {
        ...(context.projectId ? { projectId: context.projectId } : {}),
        taskId: context.taskId,
      },
      request,
    )
  ) {
    return { approved: true as const };
  }

  const decision = await (context.requestApproval ?? awaitApproval)(context.taskId, request);
  return decision === "approved"
    ? { approved: true as const }
    : { approved: false as const, decision };
}

function createWriteTool<T extends z.AnyZodObject>({
  action,
  connectorId,
  description,
  destructive,
  displayName,
  forbidden,
  inputSchema,
  method = "POST",
  name,
  request,
  target,
}: ProviderRequestSpec<T> & {
  action: string;
  destructive?: (input: z.infer<T>) => boolean;
  displayName: string;
  forbidden?: (input: z.infer<T>) => string | null;
  target: (input: z.infer<T>) => string;
}): ToolDefinition {
  return {
    backendSupport: { e2b: true, local: true },
    description,
    inputSchema,
    name,
    requiresApproval: (input, context) =>
      !isFullAccess(context) ||
      Boolean(destructive?.(input as z.infer<T>)) ||
      Boolean(forbidden?.(input as z.infer<T>)),
    sideEffectClass: "write",
    async implementation(input, context) {
      const parsed = inputSchema.parse(input);
      const accountAlias = "accountAlias" in parsed ? parsed.accountAlias : undefined;
      const callId = emitIntegrationToolCall(context, name, {
        ...(accountAlias ? { accountAlias } : {}),
        action,
        target: target(parsed),
      });

      const forbiddenReason = forbidden?.(parsed);
      if (forbiddenReason) {
        const message = `${displayName} action denied by forbidden pattern: ${forbiddenReason}`;
        emitIntegrationToolResult(context, callId, message, message);
        return message;
      }

      const approval = await ensureIntegrationApproval({
        action,
        agentReason: "agentReason" in parsed ? parsed.agentReason : null,
        context,
        destructive: destructive?.(parsed) ?? false,
        displayName,
        target: target(parsed),
      });
      if (!approval.approved) {
        const message = `${displayName} ${action} ${approval.decision}.`;
        emitIntegrationToolResult(context, callId, message, message);
        return message;
      }

      try {
        const providerRequest = request(parsed);
        const response = await runtimeFor(context).request({
          ...(accountAlias ? { accountAlias } : {}),
          connectorId,
          ...(providerRequest.data !== undefined ? { data: providerRequest.data } : {}),
          endpoint: providerRequest.endpoint,
          method,
          ...(providerRequest.params ? { params: providerRequest.params } : {}),
          userId: requireUserId(context),
        });
        const output = formatProviderResponse(response.data);
        emitIntegrationToolResult(context, callId, output);
        await appendActionLog({
          ...actionContext(context),
          description: `${displayName} ${action}: ${target(parsed)}`,
          metadata: { accountAlias: response.accountAlias, connectorId },
          outcomeType: "integration_action",
          reversible: false,
          target: target(parsed),
          timestamp: new Date().toISOString(),
        });
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
        ? `${displayName} execute does not perform writes directly. Use the explicit ${displayName} write tools so approval gates and action logging run.`
        : `${displayName} execute is a read-only fallback. Use the explicit ${connectorId} read tools for deterministic access.`;
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

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function rfc822Message(input: z.infer<typeof gmailSendInput>) {
  const headers = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${input.body}`;
}

function forbiddenSlackBroadcast(input: z.infer<typeof slackSendInput>) {
  return /(^|\s)(@channel|@everyone|<!channel>|<!everyone>)(\s|$)/i.test(input.text)
    ? "Slack broadcast mentions are denied in Phase 6."
    : null;
}

function notionCreatePayload(input: z.infer<typeof notionCreatePageInput>) {
  const parent = input.databaseId
    ? { database_id: input.databaseId }
    : { page_id: input.parentPageId };
  return {
    children: input.content
      ? [
          {
            object: "block",
            paragraph: {
              rich_text: [{ text: { content: input.content }, type: "text" }],
            },
            type: "paragraph",
          },
        ]
      : [],
    parent,
    properties: {
      title: {
        title: [{ text: { content: input.title }, type: "text" }],
      },
    },
  };
}

function calendarEventPayload(input: z.infer<typeof calendarCreateEventInput>) {
  return {
    ...(input.attendees?.length
      ? { attendees: input.attendees.map((email) => ({ email })) }
      : {}),
    ...(input.description ? { description: input.description } : {}),
    end: { dateTime: input.end },
    ...(input.location ? { location: input.location } : {}),
    start: { dateTime: input.start },
    summary: input.title,
  };
}

function containsForbiddenInfrastructureChange(value: unknown) {
  const text = JSON.stringify(value).toLowerCase();
  return (
    text.includes("nameserver") ||
    text.includes("security_level") ||
    text.includes("disable_security") ||
    text.includes("env") ||
    text.includes("secret")
  );
}

function cloudflareDnsForbidden(input: { patch?: unknown; record?: unknown }) {
  return containsForbiddenInfrastructureChange(input.patch ?? input.record)
    ? "Cloudflare nameserver, security control, and secret/env changes are denied in Phase 6."
    : null;
}

function linearGraphql(query: string, variables: Record<string, unknown> = {}) {
  return { query, variables };
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

    createWriteTool({
      action: "send email",
      connectorId: "gmail",
      description: "Send a Gmail email after approval unless the project is in Full Access.",
      displayName: "Gmail",
      inputSchema: gmailSendInput,
      name: "gmail_send",
      request: (input) => ({
        data: { raw: base64Url(rfc822Message(input)) },
        endpoint: "/gmail/v1/users/me/messages/send",
      }),
      target: (input) => input.to.join(", "),
    }),
    createWriteTool({
      action: "send message",
      connectorId: "slack",
      description: "Send a Slack message after approval unless the project is in Full Access.",
      displayName: "Slack",
      forbidden: forbiddenSlackBroadcast,
      inputSchema: slackSendInput,
      name: "slack_send_message",
      request: (input) => ({
        data: { channel: input.channelId, text: input.text },
        endpoint: "/api/chat.postMessage",
      }),
      target: (input) => input.channelId,
    }),
    createWriteTool({
      action: "create page",
      connectorId: "notion",
      description: "Create a Notion page after approval unless the project is in Full Access.",
      displayName: "Notion",
      forbidden: (input) =>
        input.databaseId || input.parentPageId
          ? null
          : "Provide databaseId or parentPageId.",
      inputSchema: notionCreatePageInput,
      name: "notion_create_page",
      request: (input) => ({
        data: notionCreatePayload(input),
        endpoint: "/v1/pages",
      }),
      target: (input) => input.databaseId ?? input.parentPageId ?? "Notion parent",
    }),
    createWriteTool({
      action: "update page",
      connectorId: "notion",
      description: "Update a Notion page after approval unless the project is in Full Access.",
      displayName: "Notion",
      inputSchema: notionUpdatePageInput,
      method: "PATCH",
      name: "notion_update_page",
      request: (input) => ({
        data: input.patch,
        endpoint: `/v1/pages/${encodeURIComponent(input.pageId)}`,
      }),
      target: (input) => input.pageId,
    }),
    createWriteTool({
      action: "create file",
      connectorId: "google-drive",
      description: "Create Google Drive file metadata after approval unless the project is in Full Access.",
      displayName: "Google Drive",
      inputSchema: driveCreateFileInput,
      name: "drive_create_file",
      request: (input) => ({
        data: {
          mimeType: input.mimeType ?? "text/plain",
          name: input.name,
          ...(input.parents?.length ? { parents: input.parents } : {}),
        },
        endpoint: "/drive/v3/files",
      }),
      target: (input) => input.name,
    }),
    createWriteTool({
      action: "copy file",
      connectorId: "google-drive",
      description: "Copy a Google Drive file after approval unless the project is in Full Access.",
      displayName: "Google Drive",
      inputSchema: driveCopyFileInput,
      name: "drive_copy_file",
      request: (input) => ({
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.parents?.length ? { parents: input.parents } : {}),
        },
        endpoint: `/drive/v3/files/${encodeURIComponent(input.fileId)}/copy`,
      }),
      target: (input) => input.fileId,
    }),
    createWriteTool({
      action: "create issue",
      connectorId: "github",
      description: "Create a GitHub issue after approval unless the project is in Full Access.",
      displayName: "GitHub",
      inputSchema: githubCreateIssueInput,
      name: "github_create_issue",
      request: (input) => ({
        data: {
          ...(input.body ? { body: input.body } : {}),
          ...(input.labels?.length ? { labels: input.labels } : {}),
          title: input.title,
        },
        endpoint: `/repos/${input.owner}/${input.repo}/issues`,
      }),
      target: (input) => `${input.owner}/${input.repo}`,
    }),
    createWriteTool({
      action: "comment issue",
      connectorId: "github",
      description: "Comment on a GitHub issue after approval unless the project is in Full Access.",
      displayName: "GitHub",
      inputSchema: githubCommentIssueInput,
      name: "github_comment_issue",
      request: (input) => ({
        data: { body: input.body },
        endpoint: `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`,
      }),
      target: (input) => `${input.owner}/${input.repo}#${input.issueNumber}`,
    }),
    createWriteTool({
      action: "update issue",
      connectorId: "github",
      description: "Update a GitHub issue after approval unless the project is in Full Access.",
      displayName: "GitHub",
      inputSchema: githubUpdateIssueInput,
      method: "PATCH",
      name: "github_update_issue",
      request: (input) => ({
        data: input.patch,
        endpoint: `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}`,
      }),
      target: (input) => `${input.owner}/${input.repo}#${input.issueNumber}`,
    }),
    createWriteTool({
      action: "create pull request",
      connectorId: "github",
      description: "Create a GitHub pull request after approval unless the project is in Full Access.",
      displayName: "GitHub",
      inputSchema: githubCreatePullRequestInput,
      name: "github_create_pull_request",
      request: (input) => ({
        data: {
          base: input.base,
          ...(input.body ? { body: input.body } : {}),
          ...(input.draft !== null && input.draft !== undefined
            ? { draft: input.draft }
            : {}),
          head: input.head,
          title: input.title,
        },
        endpoint: `/repos/${input.owner}/${input.repo}/pulls`,
      }),
      target: (input) => `${input.owner}/${input.repo}:${input.head}->${input.base}`,
    }),

    createReadTool({
      connectorId: "google-calendar",
      description: "List Google Calendar calendars.",
      inputSchema: calendarListInput,
      name: "calendar_list_calendars",
      request: () => ({ endpoint: "/calendar/v3/users/me/calendarList" }),
    }),
    createReadTool({
      connectorId: "google-calendar",
      description: "List Google Calendar events.",
      inputSchema: calendarEventsInput,
      name: "calendar_list_events",
      request: (input) => ({
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
        params: {
          ...(input.query ? { q: input.query } : {}),
          maxResults: optionalLimit(input.maxResults, 20),
          ...(input.timeMax ? { timeMax: input.timeMax } : {}),
          ...(input.timeMin ? { timeMin: input.timeMin } : {}),
        },
      }),
    }),
    createReadTool({
      connectorId: "google-calendar",
      description: "Get one Google Calendar event.",
      inputSchema: calendarEventInput,
      name: "calendar_get_event",
      request: (input) => ({
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      }),
    }),
    createWriteTool({
      action: "create event",
      connectorId: "google-calendar",
      description: "Create a Google Calendar event after approval unless Full Access is enabled.",
      displayName: "Google Calendar",
      inputSchema: calendarCreateEventInput,
      name: "calendar_create_event",
      request: (input) => ({
        data: calendarEventPayload(input),
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
      }),
      target: (input) => `${input.calendarId ?? "primary"}:${input.title}`,
    }),
    createWriteTool({
      action: "update event",
      connectorId: "google-calendar",
      description: "Update a Google Calendar event after approval unless Full Access is enabled.",
      displayName: "Google Calendar",
      inputSchema: calendarUpdateEventInput,
      method: "PATCH",
      name: "calendar_update_event",
      request: (input) => ({
        data: input.patch,
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      }),
      target: (input) => `${input.calendarId}:${input.eventId}`,
    }),
    createWriteTool({
      action: "delete event",
      connectorId: "google-calendar",
      description: "Delete a targeted Google Calendar event after approval.",
      destructive: () => true,
      displayName: "Google Calendar",
      inputSchema: calendarDeleteEventInput,
      method: "DELETE",
      name: "calendar_delete_event",
      request: (input) => ({
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      }),
      target: (input) => `${input.calendarId}:${input.eventId}`,
    }),
    createExecuteTool("google-calendar", "calendar_execute", "Google Calendar"),

    createReadTool({
      connectorId: "cloudflare",
      description: "List Cloudflare accounts.",
      inputSchema: cloudflareAccountInput,
      name: "cloudflare_list_accounts",
      request: () => ({ endpoint: "/client/v4/accounts" }),
    }),
    createReadTool({
      connectorId: "cloudflare",
      description: "List Cloudflare zones.",
      inputSchema: cloudflareAccountInput,
      name: "cloudflare_list_zones",
      request: () => ({ endpoint: "/client/v4/zones" }),
    }),
    createReadTool({
      connectorId: "cloudflare",
      description: "List Cloudflare DNS records for one zone.",
      inputSchema: cloudflareDnsInput,
      name: "cloudflare_list_dns_records",
      request: (input) => ({
        endpoint: `/client/v4/zones/${encodeURIComponent(input.zoneId)}/dns_records`,
      }),
    }),
    createReadTool({
      connectorId: "cloudflare",
      description: "Get a Cloudflare Pages project.",
      inputSchema: cloudflarePagesInput,
      name: "cloudflare_get_pages_project",
      request: (input) => ({
        endpoint: `/client/v4/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}`,
      }),
    }),
    createWriteTool({
      action: "update DNS record",
      connectorId: "cloudflare",
      description: "Update a Cloudflare DNS record after approval unless Full Access is enabled.",
      displayName: "Cloudflare",
      forbidden: cloudflareDnsForbidden,
      inputSchema: cloudflareUpdateDnsInput,
      method: "PATCH",
      name: "cloudflare_update_dns_record",
      request: (input) => ({
        data: input.patch,
        endpoint: `/client/v4/zones/${encodeURIComponent(input.zoneId)}/dns_records/${encodeURIComponent(input.recordId)}`,
      }),
      target: (input) => `${input.zoneId}:${input.recordId}`,
    }),
    createWriteTool({
      action: "create DNS record",
      connectorId: "cloudflare",
      description: "Create a Cloudflare DNS record after approval unless Full Access is enabled.",
      displayName: "Cloudflare",
      forbidden: cloudflareDnsForbidden,
      inputSchema: cloudflareCreateDnsInput,
      name: "cloudflare_create_dns_record",
      request: (input) => ({
        data: input.record,
        endpoint: `/client/v4/zones/${encodeURIComponent(input.zoneId)}/dns_records`,
      }),
      target: (input) => input.zoneId,
    }),
    createWriteTool({
      action: "purge cache",
      connectorId: "cloudflare",
      description: "Purge Cloudflare cache after approval; purgeEverything always requires approval.",
      destructive: (input) => input.purgeEverything === true,
      displayName: "Cloudflare",
      inputSchema: cloudflarePurgeCacheInput,
      name: "cloudflare_purge_cache",
      request: (input) => ({
        data: input.purgeEverything
          ? { purge_everything: true }
          : { files: input.files ?? [] },
        endpoint: `/client/v4/zones/${encodeURIComponent(input.zoneId)}/purge_cache`,
      }),
      target: (input) => input.zoneId,
    }),
    createWriteTool({
      action: "deploy Pages",
      connectorId: "cloudflare",
      description: "Trigger a Cloudflare Pages deployment after approval unless Full Access is enabled.",
      displayName: "Cloudflare",
      inputSchema: cloudflareDeployPagesInput,
      name: "cloudflare_deploy_pages",
      request: (input) => ({
        data: input.source ?? {},
        endpoint: `/client/v4/accounts/${encodeURIComponent(input.accountId)}/pages/projects/${encodeURIComponent(input.projectName)}/deployments`,
      }),
      target: (input) => `${input.accountId}:${input.projectName}`,
    }),
    createExecuteTool("cloudflare", "cloudflare_execute", "Cloudflare"),

    createReadTool({
      connectorId: "vercel",
      description: "List Vercel projects.",
      inputSchema: vercelProjectsInput,
      name: "vercel_list_projects",
      request: (input) => ({
        endpoint: "/v9/projects",
        params: { ...(input.teamId ? { teamId: input.teamId } : {}) },
      }),
    }),
    createReadTool({
      connectorId: "vercel",
      description: "List Vercel deployments.",
      inputSchema: vercelDeploymentsInput,
      name: "vercel_list_deployments",
      request: (input) => ({
        endpoint: "/v6/deployments",
        params: {
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
        },
      }),
    }),
    createReadTool({
      connectorId: "vercel",
      description: "Get Vercel deployment logs/events.",
      inputSchema: vercelDeploymentLogsInput,
      name: "vercel_get_deployment_logs",
      request: (input) => ({
        endpoint: `/v2/deployments/${encodeURIComponent(input.deploymentId)}/events`,
      }),
    }),
    createReadTool({
      connectorId: "vercel",
      description: "Get a Vercel project.",
      inputSchema: vercelProjectInput,
      name: "vercel_get_project",
      request: (input) => ({
        endpoint: `/v9/projects/${encodeURIComponent(input.projectIdOrName)}`,
        params: { ...(input.teamId ? { teamId: input.teamId } : {}) },
      }),
    }),
    createWriteTool({
      action: "create deployment",
      connectorId: "vercel",
      description: "Create a Vercel deployment after approval unless Full Access is enabled.",
      displayName: "Vercel",
      inputSchema: vercelCreateDeploymentInput,
      name: "vercel_create_deployment",
      request: (input) => ({
        data: {
          name: input.projectIdOrName,
          ...(input.ref ? { gitSource: { ref: input.ref } } : {}),
        },
        endpoint: "/v13/deployments",
        params: { ...(input.teamId ? { teamId: input.teamId } : {}) },
      }),
      target: (input) => input.projectIdOrName,
    }),
    createWriteTool({
      action: "cancel deployment",
      connectorId: "vercel",
      description: "Cancel a Vercel deployment after approval.",
      destructive: () => true,
      displayName: "Vercel",
      inputSchema: vercelDeploymentActionInput,
      method: "PATCH",
      name: "vercel_cancel_deployment",
      request: (input) => ({
        endpoint: `/v12/deployments/${encodeURIComponent(input.deploymentId)}/cancel`,
      }),
      target: (input) => input.deploymentId,
    }),
    createWriteTool({
      action: "rollback deployment",
      connectorId: "vercel",
      description: "Rollback a Vercel project after approval.",
      destructive: () => true,
      displayName: "Vercel",
      inputSchema: vercelRollbackInput,
      name: "vercel_rollback_deployment",
      request: (input) => ({
        data: { deploymentId: input.deploymentId },
        endpoint: `/v9/projects/${encodeURIComponent(input.projectIdOrName)}/rollback`,
      }),
      target: (input) => `${input.projectIdOrName}:${input.deploymentId}`,
    }),
    createExecuteTool("vercel", "vercel_execute", "Vercel"),

    createReadTool({
      connectorId: "linear",
      description: "Search Linear issues.",
      inputSchema: linearSearchIssuesInput,
      method: "POST",
      name: "linear_search_issues",
      request: (input) => ({
        data: linearGraphql(
          `query SearchIssues($filter: IssueFilter, $first: Int) { issues(filter: $filter, first: $first) { nodes { id identifier title url state { name } } } }`,
          {
            filter: {
              ...(input.teamId ? { team: { id: { eq: input.teamId } } } : {}),
              title: { containsIgnoreCase: input.query },
            },
            first: optionalLimit(input.maxResults, 10),
          },
        ),
        endpoint: "/graphql",
      }),
    }),
    createReadTool({
      connectorId: "linear",
      description: "Get a Linear issue.",
      inputSchema: linearIssueInput,
      method: "POST",
      name: "linear_get_issue",
      request: (input) => ({
        data: linearGraphql(
          `query Issue($id: String!) { issue(id: $id) { id identifier title description url state { name } assignee { name email } } }`,
          { id: input.issueIdOrKey },
        ),
        endpoint: "/graphql",
      }),
    }),
    createReadTool({
      connectorId: "linear",
      description: "List Linear teams.",
      inputSchema: z.object({ accountAlias }),
      method: "POST",
      name: "linear_list_teams",
      request: () => ({
        data: linearGraphql(`query Teams { teams { nodes { id key name } } }`),
        endpoint: "/graphql",
      }),
    }),
    createReadTool({
      connectorId: "linear",
      description: "List Linear projects.",
      inputSchema: linearListInput,
      method: "POST",
      name: "linear_list_projects",
      request: (input) => ({
        data: linearGraphql(
          `query Projects($filter: ProjectFilter) { projects(filter: $filter) { nodes { id name state url } } }`,
          { filter: input.teamId ? { team: { id: { eq: input.teamId } } } : {} },
        ),
        endpoint: "/graphql",
      }),
    }),
    createWriteTool({
      action: "create issue",
      connectorId: "linear",
      description: "Create a Linear issue after approval unless Full Access is enabled.",
      displayName: "Linear",
      inputSchema: linearCreateIssueInput,
      method: "POST",
      name: "linear_create_issue",
      request: (input) => ({
        data: linearGraphql(
          `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`,
          {
            input: {
              ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
              ...(input.description ? { description: input.description } : {}),
              ...(input.projectId ? { projectId: input.projectId } : {}),
              teamId: input.teamId,
              title: input.title,
            },
          },
        ),
        endpoint: "/graphql",
      }),
      target: (input) => input.teamId,
    }),
    createWriteTool({
      action: "update issue",
      connectorId: "linear",
      description: "Update a Linear issue after approval unless Full Access is enabled.",
      displayName: "Linear",
      forbidden: (input) =>
        JSON.stringify(input.patch).toLowerCase().includes("bulk")
          ? "Bulk Linear issue updates are denied in Phase 6."
          : null,
      inputSchema: linearUpdateIssueInput,
      method: "POST",
      name: "linear_update_issue",
      request: (input) => ({
        data: linearGraphql(
          `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url } } }`,
          { id: input.issueId, input: input.patch },
        ),
        endpoint: "/graphql",
      }),
      target: (input) => input.issueId,
    }),
    createWriteTool({
      action: "comment issue",
      connectorId: "linear",
      description: "Comment on a Linear issue after approval unless Full Access is enabled.",
      displayName: "Linear",
      inputSchema: linearCommentIssueInput,
      method: "POST",
      name: "linear_comment_issue",
      request: (input) => ({
        data: linearGraphql(
          `mutation CommentIssue($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id url } } }`,
          { input: { body: input.body, issueId: input.issueId } },
        ),
        endpoint: "/graphql",
      }),
      target: (input) => input.issueId,
    }),
    createExecuteTool("linear", "linear_execute", "Linear"),
  ];
}
