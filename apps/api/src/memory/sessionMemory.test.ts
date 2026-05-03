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
    getSessionMemory: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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
        memoryEnabled: true,
        project: { memoryScope: "NONE" },
      }),
    ).toBe(true);
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
      expect.objectContaining({
        messages: [expect.objectContaining({ content: "User's favorite color is teal." })],
        sessionId: "global_handle-local-user",
      }),
    );
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: "User's favorite color is teal." })],
        sessionId: "project_project-1",
      }),
    );
  });

  it("stores assistant messages only in the conversation session", async () => {
    const fakeClient = client();

    await appendMessageToZep(
      {
        content: "Got it — teal it is!",
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
        role: "ASSISTANT",
      },
      fakeClient as never,
    );

    expect(fakeClient.ensureSession).toHaveBeenCalledTimes(1);
    expect(fakeClient.ensureSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "conv_conversation-1" }),
    );
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledTimes(1);
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "conv_conversation-1" }),
    );
  });

  it("redacts secrets in conversation history and skips fact memory writes", async () => {
    const fakeClient = client();

    await appendMessageToZep(
      {
        content: `My key is sk-${"s".repeat(30)} and card is 4111 1111 1111 1111`,
        conversationId: "conversation-redact",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
        role: "USER",
      },
      fakeClient as never,
    );

    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: "My key is [REDACTED] and card is [REDACTED]",
          }),
        ],
        sessionId: "conv_conversation-redact",
      }),
    );
    expect(fakeClient.addMemoryMessages).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "project_project-1" }),
    );
  });

  it("deduplicates identical facts in global and project memory namespaces", async () => {
    const fakeClient = client({
      getSessionMemory: vi.fn().mockImplementation(({ sessionId }) =>
        Promise.resolve({
          ok: true,
          value: sessionId.startsWith("conv_")
            ? []
            : [
                {
                  content: "User's favorite color is teal.",
                  metadata: { role: "USER" },
                  role: "user",
                },
              ],
        }),
      ),
    });

    await appendMessageToZep(
      {
        content: "  My   favorite color is TEAL  ",
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
        role: "USER",
      },
      fakeClient as never,
    );

    expect(fakeClient.addMemoryMessages).toHaveBeenCalledTimes(1);
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "conv_conversation-1" }),
    );
  });

  it("skips client calls when memory is disabled for a message", async () => {
    const fakeClient = client();

    await expect(
      appendMessageToZep(
        {
          content: "Do not save this",
          memoryEnabled: false,
          project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" },
          role: "USER",
        },
        fakeClient as never,
      ),
    ).resolves.toEqual({ ok: true, skipped: true });
    expect(fakeClient.checkConnection).not.toHaveBeenCalled();
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
    expect(formatMemoryContext(facts)).toContain("[stated, validity unknown] Favorite color is teal");
  });

  it("marks older contradictory residence facts historical", async () => {
    const fakeClient = client({
      getSessionMemory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            content: "I live in Chicago",
            metadata: {
              bitemporalKey: "residence",
              bitemporalValue: "chicago",
              valid_at: "2026-01-01T00:00:00.000Z",
            },
            role: "user",
          },
        ],
      }),
    });

    await appendMessageToZep(
      {
        content: "I moved to Austin",
        conversationId: "conversation-1",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
        role: "USER",
        validAt: "2026-03-15T00:00:00.000Z",
      },
      fakeClient as never,
    );

    expect(fakeClient.deleteSessionMemory).toHaveBeenCalledWith({
      sessionId: "project_project-1",
    });
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: "I live in Chicago",
            metadata: expect.objectContaining({
              invalid_at: "2026-03-15T00:00:00.000Z",
            }),
          }),
          expect.objectContaining({
            content: "User lives in Austin.",
            metadata: expect.objectContaining({
              bitemporalKey: "residence",
              bitemporalValue: "austin",
              valid_at: "2026-03-15T00:00:00.000Z",
            }),
          }),
        ]),
      }),
    );
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

  it("forgets all memory layers by default for global-and-project projects", async () => {
    const fakeClient = client();

    await expect(
      forgetMemoryForProject(
        { project: { id: "project-1", memoryScope: "GLOBAL_AND_PROJECT" } },
        fakeClient as never,
      ),
    ).resolves.toEqual({ deletedSessions: 2 });
    expect(fakeClient.deleteSessionMemory).toHaveBeenCalledWith({
      sessionId: "global_handle-local-user",
    });
    expect(fakeClient.deleteSessionMemory).toHaveBeenCalledWith({
      sessionId: "project_project-1",
    });
  });

  it("does not extract questions or ordinary imperatives as memory facts", async () => {
    const fakeClient = client();

    await appendMessageToZep(
      {
        content: "What's my favorite color?",
        conversationId: "conversation-question",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
        role: "USER",
      },
      fakeClient as never,
    );
    await appendMessageToZep(
      {
        content: "Tell me a joke",
        conversationId: "conversation-imperative",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
        role: "USER",
      },
      fakeClient as never,
    );

    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "conv_conversation-question" }),
    );
    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "conv_conversation-imperative" }),
    );
    expect(fakeClient.addMemoryMessages).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "project_project-1" }),
    );
  });

  it("stores a normalized fact for remember statements without storing raw text", async () => {
    const fakeClient = client();

    await appendMessageToZep(
      {
        content: "Remember that I drive a 2018 Toyota Tacoma.",
        conversationId: "conversation-remember",
        project: { id: "project-1", memoryScope: "PROJECT_ONLY" },
        role: "USER",
      },
      fakeClient as never,
    );

    expect(fakeClient.addMemoryMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: "User drives a 2018 Toyota Tacoma." })],
        sessionId: "project_project-1",
      }),
    );
    expect(fakeClient.addMemoryMessages).not.toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: expect.stringMatching(/^Remember that/i) })],
        sessionId: "project_project-1",
      }),
    );
  });
});
