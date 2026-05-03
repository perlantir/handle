import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "./toolRegistry";

vi.mock("../approvals/approvalWaiter", () => ({
  awaitApproval: vi.fn().mockResolvedValue("approved"),
}));

vi.mock("../memory/sessionMemory", () => ({
  appendMessageToZep: vi.fn().mockResolvedValue({ ok: true }),
  effectiveMemoryScope: vi.fn((project) => project?.memoryScope ?? "GLOBAL_AND_PROJECT"),
  forgetMemoryForProject: vi.fn().mockResolvedValue({ deletedSessions: 1 }),
  getRelevantMemoryForTask: vi.fn().mockResolvedValue([
    { content: "Favorite color is teal", source: "project" },
  ]),
}));

import { awaitApproval } from "../approvals/approvalWaiter";
import {
  appendMessageToZep,
  forgetMemoryForProject,
  getRelevantMemoryForTask,
} from "../memory/sessionMemory";
import { createMemoryToolDefinitions } from "./memoryTools";

function context(): ToolExecutionContext {
  return {
    backend: {
      id: "e2b",
      async browserSession() {
        throw new Error("not used");
      },
      async fileDelete() {},
      async fileList() {
        return [];
      },
      async fileRead() {
        return "";
      },
      async fileWrite() {},
      getWorkspaceDir() {
        return "/home/user";
      },
      async initialize() {},
      async shellExec() {
        return { exitCode: 0, stderr: "", stdout: "" };
      },
      async shutdown() {},
    },
    conversationId: "conversation-test",
    memoryProject: { id: "project-test", memoryScope: "GLOBAL_AND_PROJECT" },
    sandbox: {
      commands: { run: vi.fn() },
      files: { list: vi.fn(), read: vi.fn(), write: vi.fn() },
      kill: vi.fn(),
      sandboxId: "sandbox-test",
    },
    taskId: "run-test",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("memory tools", () => {
  it("saves memory through the session memory layer", async () => {
    const save = createMemoryToolDefinitions().find((tool) => tool.name === "memory_save");
    if (!save) throw new Error("memory_save missing");

    await expect(
      save.implementation({ fact: "Favorite color is teal" }, context()),
    ).resolves.toBe("Saved memory.");
    expect(appendMessageToZep).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Favorite color is teal",
        extractionMode: "explicit_fact",
        project: { id: "project-test", memoryScope: "GLOBAL_AND_PROJECT" },
      }),
    );
  });

  it("does not report success when redaction blocks a memory save", async () => {
    vi.mocked(appendMessageToZep).mockResolvedValueOnce({
      factsWritten: 0,
      ok: true,
      skipped: false,
      skippedReason: "redaction_marker_present",
    });
    const save = createMemoryToolDefinitions().find((tool) => tool.name === "memory_save");
    if (!save) throw new Error("memory_save missing");

    const result = await save.implementation(
      { fact: "User's API key is [REDACTED]." },
      context(),
    );

    expect(result).toContain("Secret-shaped content was blocked");
    expect(result).toContain("did not keep");
    expect(result).not.toContain("Saved memory");
  });

  it("reports memory offline instead of saved when the write layer fails", async () => {
    vi.mocked(appendMessageToZep).mockResolvedValueOnce({
      ok: false,
      skipped: true,
      skippedReason: "memory_offline",
    });
    const save = createMemoryToolDefinitions().find((tool) => tool.name === "memory_save");
    if (!save) throw new Error("memory_save missing");

    await expect(
      save.implementation({ fact: "Favorite color is teal" }, context()),
    ).resolves.toBe("Memory is currently offline; I could not save that fact.");
  });

  it("searches memory through the recall layer", async () => {
    const search = createMemoryToolDefinitions().find((tool) => tool.name === "memory_search");
    if (!search) throw new Error("memory_search missing");

    const result = await search.implementation({ query: "favorite color" }, context());

    expect(result).toContain("Favorite color is teal");
    expect(getRelevantMemoryForTask).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "favorite color", taskId: "run-test" }),
    );
  });

  it("requires approval before forgetting memory", async () => {
    const forget = createMemoryToolDefinitions().find((tool) => tool.name === "memory_forget");
    if (!forget) throw new Error("memory_forget missing");

    const result = await forget.implementation(
      { query: "favorite color", scope: "project" },
      context(),
    );

    expect(awaitApproval).toHaveBeenCalledWith(
      "run-test",
      expect.objectContaining({ type: "memory_forget" }),
    );
    expect(forgetMemoryForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        project: { id: "project-test", memoryScope: "GLOBAL_AND_PROJECT" },
        scope: "project",
      }),
    );
    expect(result).toContain("Forgot memory namespace");
  });

  it("returns a clear disabled message when memory context is unavailable", async () => {
    const save = createMemoryToolDefinitions().find((tool) => tool.name === "memory_save");
    if (!save) throw new Error("memory_save missing");

    const disabledContext = {
      ...context(),
      memoryProject: null,
    };

    await expect(
      save.implementation({ fact: "Favorite color is teal" }, disabledContext),
    ).resolves.toBe("Memory is disabled for this project or message.");
    expect(appendMessageToZep).not.toHaveBeenCalled();
  });
});
