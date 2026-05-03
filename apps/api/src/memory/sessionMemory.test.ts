import { describe, expect, it, vi } from "vitest";
import {
  appendMessageToZep,
  forgetMemoryForProject,
  formatMemoryContext,
  getRelevantMemoryForTask,
  isMemoryEnabled,
  memorySessionIds,
} from "./sessionMemory";

function client(overrides: Record<string, unknown> = {}) {
  return {
    addMemoryMessages: vi.fn().mockResolvedValue({ ok: true }),
    checkConnection: vi.fn().mockResolvedValue({
      checkedAt: new Date().toISOString(),
      provider: "self-hosted",
      status: "online",
    }),
    ensureSession: vi.fn().mockResolvedValue({ ok: true }),
    ensureUser: vi.fn().mockResolvedValue({ ok: true }),
    searchMemory: vi.fn().mockResolvedValue({
      ok: true,
      value: [{ content: "Favorite color is teal", score: 0.2 }],
    }),
    deleteSessionMemory: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("session memory", () => {
  it("maps memory scope to namespace sessions", () => {
    expect(
      memorySessionIds({
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
        userId: "user@example.com",
      }),
    ).toEqual([
      { id: "conv_conversation-1", source: "conversation" },
      { id: "global_user_example_com", source: "global" },
      { id: "project_project-1", source: "project" },
    ]);

    expect(
      memorySessionIds({
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
      }),
    ).toEqual([
      { id: "conv_conversation-1", source: "conversation" },
      { id: "project_project-1", source: "project" },
    ]);
  });

  it("disables memory when project scope is NONE or message override is false", () => {
    expect(isMemoryEnabled({ project: { memoryScope: "NONE" } })).toBe(false);
    expect(
      isMemoryEnabled({
        memoryEnabled: false,
        project: { memoryScope: "GLOBAL_AND_PROJECT" },
      }),
    ).toBe(false);
  });

  it("appends messages to conversation, global, and project sessions", async () => {
    const fakeClient = client();

    await appendMessageToZep(
      {
        content: "My favorite color is teal",
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
        role: "USER",
      },
      fakeClient as never,
    );

    expect(fakeClient.ensureSession).toHaveBeenCalledTimes(3);
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "global_handle-local-user" }),
    );
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "project_project-1" }),
    );
  });

  it("recalls and formats relevant memory", async () => {
    const fakeClient = client();

    const facts = await getRelevantMemoryForTask(
      {
        conversationId: "conversation-2",
        goal: "What is my favorite color?",
        project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
        taskId: "run-1",
      },
      fakeClient as never,
    );

    expect(facts).toEqual([
      { content: "Favorite color is teal", score: 0.2, source: "global" },
    ]);
    expect(formatMemoryContext(facts)).toContain("[global] Favorite color is teal");
  });

  it("gracefully returns no context when Zep is offline", async () => {
    const fakeClient = client({
      checkConnection: vi.fn().mockResolvedValue({
        checkedAt: new Date().toISOString(),
        detail: "connect ECONNREFUSED",
        provider: "self-hosted",
        status: "offline",
      }),
    });

    await expect(
      getRelevantMemoryForTask(
        {
          goal: "What did I say?",
          project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
          taskId: "run-1",
        },
        fakeClient as never,
      ),
    ).resolves.toEqual([]);
  });

  it("forgets project memory by deleting the project namespace", async () => {
    const fakeClient = client();

    await expect(
      forgetMemoryForProject(
        { project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" } },
        fakeClient as never,
      ),
    ).resolves.toEqual({ deletedSessions: 1 });
    expect(fakeClient.deleteSessionMemory).toHaveBeenCalledWith({
      sessionId: "project_project-1",
    });
  });
});
