import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../agent/toolRegistry";
import { maybeRecordIntegrationMemoryCandidate } from "./integrationMemory";

function context(
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  return {
    backend: {
      getWorkspaceDir: () => "/tmp/handle-workspace",
      id: "local",
    } as ToolExecutionContext["backend"],
    conversationId: "conversation-integration-memory",
    memoryEnabled: true,
    memoryProject: {
      id: "project-integration-memory",
      memoryScope: "GLOBAL_AND_PROJECT",
    },
    projectId: "project-integration-memory",
    sandbox: { sandboxId: "sandbox-integration-memory" } as ToolExecutionContext["sandbox"],
    taskId: "task-integration-memory",
    userId: "user-integration-memory",
    ...overrides,
  };
}

describe("integration memory candidates", () => {
  it("does not write when the per-message memory toggle is off", async () => {
    const appendToMemory = vi.fn().mockResolvedValue({ ok: true });
    const integrationLookup = {
      findFirst: vi.fn().mockResolvedValue({ memoryScope: "PROJECT_ONLY" }),
    };

    const result = await maybeRecordIntegrationMemoryCandidate(
      {
        action: "create issue",
        connectorId: "github",
        context: context({ memoryEnabled: false }),
        target: "perlantir/handle",
      },
      { appendToMemory, integrationLookup },
    );

    expect(result).toEqual({ reason: "memory_disabled", written: false });
    expect(integrationLookup.findFirst).not.toHaveBeenCalled();
    expect(appendToMemory).not.toHaveBeenCalled();
  });

  it("uses the connector memory scope and only writes allowlisted metadata", async () => {
    const appendToMemory = vi.fn().mockResolvedValue({ ok: true });
    const integrationLookup = {
      findFirst: vi.fn().mockResolvedValue({ memoryScope: "PROJECT_ONLY" }),
    };

    const result = await maybeRecordIntegrationMemoryCandidate(
      {
        accountAlias: "default",
        action: "create issue",
        connectorId: "github",
        context: context(),
        target: "perlantir/handle",
      },
      { appendToMemory, integrationLookup },
    );

    expect(result).toEqual({ written: true });
    expect(integrationLookup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountAlias: "default",
          connectorId: "GITHUB",
          status: "CONNECTED",
          userId: "user-integration-memory",
        }),
      }),
    );
    expect(appendToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "GitHub create issue target: perlantir/handle",
        extractionMode: "explicit_fact",
        project: expect.objectContaining({
          id: "project-integration-memory",
          memoryScope: "PROJECT_ONLY",
        }),
        role: "USER",
      }),
    );
  });

  it("skips connectors whose memory toggle is off", async () => {
    const appendToMemory = vi.fn().mockResolvedValue({ ok: true });
    const integrationLookup = {
      findFirst: vi.fn().mockResolvedValue({ memoryScope: "NONE" }),
    };

    const result = await maybeRecordIntegrationMemoryCandidate(
      {
        action: "send message",
        connectorId: "slack",
        context: context(),
        target: "C123",
      },
      { appendToMemory, integrationLookup },
    );

    expect(result).toEqual({ reason: "connector_memory_none", written: false });
    expect(appendToMemory).not.toHaveBeenCalled();
  });
});
