import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationToolRuntime } from "../integrations/toolRuntime";
import type { ToolExecutionContext } from "./toolRegistry";
import { createTier1IntegrationToolDefinitions } from "./integrationTools";

function context(
  runtime: IntegrationToolRuntime,
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  return {
    backend: {
      getWorkspaceDir: () => "/home/user",
      id: "e2b",
    } as ToolExecutionContext["backend"],
    integrationRuntime: runtime,
    sandbox: { sandboxId: "sandbox-integration-test" } as ToolExecutionContext["sandbox"],
    taskId: "run-integration-test",
    userId: "user-integration-test",
    ...overrides,
  };
}

function tool(name: string) {
  const definition = createTier1IntegrationToolDefinitions().find(
    (item) => item.name === name,
  );
  if (!definition) throw new Error(`Missing tool ${name}`);
  return definition;
}

describe("Tier 1 integration read tools", () => {
  const originalLogDir = process.env.HANDLE_LOG_DIR;

  beforeEach(async () => {
    process.env.HANDLE_LOG_DIR = await mkdtemp(join(tmpdir(), "handle-integration-tools-test-"));
  });

  afterEach(() => {
    if (originalLogDir === undefined) {
      delete process.env.HANDLE_LOG_DIR;
    } else {
      process.env.HANDLE_LOG_DIR = originalLogDir;
    }
  });

  it("routes GitHub issue listing through the selected connected account", async () => {
    const request = vi.fn().mockResolvedValue({
      accountAlias: "work",
      connectorId: "github",
      data: [{ number: 1, title: "Test issue" }],
      endpoint: "/repos/perlantir/handle/issues",
      method: "GET",
    });
    const result = await tool("github_list_issues").implementation(
      { accountAlias: "work", owner: "perlantir", repo: "handle", state: "all" },
      context({ request }),
    );

    expect(request).toHaveBeenCalledWith({
      accountAlias: "work",
      connectorId: "github",
      endpoint: "/repos/perlantir/handle/issues",
      method: "GET",
      params: { state: "all" },
      userId: "user-integration-test",
    });
    expect(result).toContain("Test issue");
  });

  it("uses provider-specific read endpoints for Gmail search", async () => {
    const request = vi.fn().mockResolvedValue({
      accountAlias: "default",
      connectorId: "gmail",
      data: { messages: [{ id: "msg-1" }] },
      endpoint: "/gmail/v1/users/me/messages",
      method: "GET",
    });

    await tool("gmail_search").implementation(
      { query: "from:team@example.com", maxResults: 5 },
      context({ request }),
    );

    expect(request).toHaveBeenCalledWith({
      connectorId: "gmail",
      endpoint: "/gmail/v1/users/me/messages",
      method: "GET",
      params: { maxResults: 5, q: "from:team@example.com" },
      userId: "user-integration-test",
    });
  });

  it("blocks write-shaped execute instructions until Stage 3", async () => {
    const request = vi.fn();
    const result = await tool("gmail_execute").implementation(
      { instruction: "send an email to the team" },
      context({ request }),
    );

    expect(result).toContain("does not perform writes directly");
    expect(request).not.toHaveBeenCalled();
  });

  it("requires an authenticated user context", async () => {
    const request = vi.fn();
    const runtime = { request };
    const base = context(runtime);
    delete base.userId;

    await expect(
      tool("github_list_issues").implementation({}, base),
    ).rejects.toThrow("authenticated user context");
  });

  it("requests approval for write tools in Ask mode", async () => {
    const request = vi.fn();
    const requestApproval = vi.fn().mockResolvedValue("denied");

    const result = await tool("github_create_issue").implementation(
      {
        agentReason: "Create a tracked audit issue.",
        owner: "perlantir",
        repo: "handle",
        title: "Audit issue",
      },
      context(
        { request },
        { projectPermissionMode: "ASK", requestApproval, projectId: "project-test" },
      ),
    );

    expect(requestApproval).toHaveBeenCalledWith(
      "run-integration-test",
      expect.objectContaining({
        action: "create issue",
        agentReason: "Create a tracked audit issue.",
        integration: "GitHub",
        type: "destructive_integration_action",
      }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(result).toContain("denied");
  });

  it("runs non-destructive write tools without approval in Full Access", async () => {
    const request = vi.fn().mockResolvedValue({
      accountAlias: "default",
      connectorId: "github",
      data: { number: 42, title: "Audit issue" },
      endpoint: "/repos/perlantir/handle/issues",
      method: "POST",
    });
    const requestApproval = vi.fn();

    const result = await tool("github_create_issue").implementation(
      { owner: "perlantir", repo: "handle", title: "Audit issue" },
      context({ request }, { projectPermissionMode: "FULL_ACCESS", requestApproval }),
    );

    expect(requestApproval).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "github",
        endpoint: "/repos/perlantir/handle/issues",
        method: "POST",
      }),
    );
    expect(result).toContain("Audit issue");
  });

  it("denies forbidden Slack broadcast patterns without provider call", async () => {
    const request = vi.fn();
    const result = await tool("slack_send_message").implementation(
      { channelId: "C123", text: "@channel deploy is live" },
      context({ request }, { projectPermissionMode: "FULL_ACCESS" }),
    );

    expect(request).not.toHaveBeenCalled();
    expect(result).toContain("forbidden pattern");
  });

  it("registers Tier 2 read and write tools", () => {
    const names = createTier1IntegrationToolDefinitions().map((definition) => definition.name);

    expect(names).toEqual(expect.arrayContaining([
      "calendar_list_calendars",
      "calendar_create_event",
      "cloudflare_list_zones",
      "cloudflare_update_dns_record",
      "vercel_list_projects",
      "vercel_create_deployment",
      "linear_search_issues",
      "linear_create_issue",
    ]));
  });

  it("keeps destructive Tier 2 writes behind approval even in Full Access", async () => {
    const request = vi.fn();
    const requestApproval = vi.fn().mockResolvedValue("denied");

    const result = await tool("calendar_delete_event").implementation(
      { calendarId: "primary", eventId: "event-1" },
      context({ request }, { projectPermissionMode: "FULL_ACCESS", requestApproval }),
    );

    expect(requestApproval).toHaveBeenCalledWith(
      "run-integration-test",
      expect.objectContaining({
        action: "delete event",
        integration: "Google Calendar",
        type: "destructive_integration_action",
      }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(result).toContain("denied");
  });

  it("denies Cloudflare forbidden pattern writes before approval", async () => {
    const request = vi.fn();
    const requestApproval = vi.fn();

    const result = await tool("cloudflare_update_dns_record").implementation(
      { patch: { nameserver: "ns.example.com" }, recordId: "record-1", zoneId: "zone-1" },
      context({ request }, { projectPermissionMode: "FULL_ACCESS", requestApproval }),
    );

    expect(requestApproval).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(result).toContain("forbidden pattern");
  });
});
