import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "./toolRegistry";

vi.mock("../approvals/approvalWaiter", () => ({
  awaitApproval: vi.fn().mockResolvedValue("approved"),
}));

vi.mock("../memory/sessionMemory", () => ({
  appendMessageToZep: vi.fn().mockResolvedValue({ ok: true }),
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
        project: { id: "project-test", memoryScope: "GLOBAL_AND_PROJECT" },
      }),
    );
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
});
