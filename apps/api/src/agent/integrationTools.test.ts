import { describe, expect, it, vi } from "vitest";
import type { IntegrationToolRuntime } from "../integrations/toolRuntime";
import type { ToolExecutionContext } from "./toolRegistry";
import { createTier1IntegrationToolDefinitions } from "./integrationTools";

function context(runtime: IntegrationToolRuntime): ToolExecutionContext {
  return {
    backend: {
      getWorkspaceDir: () => "/home/user",
      id: "e2b",
    } as ToolExecutionContext["backend"],
    integrationRuntime: runtime,
    sandbox: { sandboxId: "sandbox-integration-test" } as ToolExecutionContext["sandbox"],
    taskId: "run-integration-test",
    userId: "user-integration-test",
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

    expect(result).toContain("write actions are not enabled");
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
});
