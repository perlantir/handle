import { describe, expect, it } from "vitest";
import {
  buildHandleSystemPrompt,
  buildPhase1SystemPrompt,
  SYSTEM_PROMPT_VERSION,
} from "./prompts";

describe("agent prompts", () => {
  it("describes E2B as an Ubuntu sandbox with /home/user", () => {
    const prompt = buildPhase1SystemPrompt({
      backendId: "e2b",
      workspaceDir: "/home/user",
    });

    expect(prompt).toContain("Backend: E2B Cloud sandbox");
    expect(prompt).toContain("Home: /home/user");
    expect(prompt).toContain("Use /home/user for task files");
    expect(prompt).toContain(`System prompt version: ${SYSTEM_PROMPT_VERSION}`);
  });

  it("injects the local macOS workspace and forbids /home/user assumptions", () => {
    const prompt = buildHandleSystemPrompt({
      backendId: "local",
      workspaceDir: "/Users/perlantir/Documents/Handle/workspaces/task-local",
    });

    expect(prompt).toContain("Backend: Local Mac");
    expect(prompt).toContain(
      "Workspace: /Users/perlantir/Documents/Handle/workspaces/task-local",
    );
    expect(prompt).toContain(
      "All file operations must use absolute paths that start with this workspace path",
    );
    expect(prompt).toContain("Do not use /home/user");
    expect(prompt).toContain("This is not an E2B Ubuntu sandbox");
    expect(prompt).toContain("browser_navigate");
  });

  it("instructs the agent to answer trivial questions without shell tools", () => {
    const prompt = buildHandleSystemPrompt();

    expect(prompt).toContain("answer directly without tools");
    expect(prompt).toContain("Do not use");
    expect(prompt).toContain("shell_exec for simple math");
    expect(SYSTEM_PROMPT_VERSION).toBe("system_prompt_v15");
  });

  it("tells the agent not to confabulate memory when recall is empty", () => {
    const prompt = buildHandleSystemPrompt({
      memoryContext: "<memory_context>None recalled</memory_context>",
    });

    expect(prompt).toContain("<memory_context>None recalled</memory_context>");
    expect(prompt).toContain("you have no");
    expect(prompt).toContain("prior memory");
    expect(prompt).toContain("Only say");
    expect(prompt).toContain("already saved");
  });

  it("injects recalled memory context when available", () => {
    const prompt = buildHandleSystemPrompt({
      memoryContext: "<memory_context>\n1. [stated, valid since 2026-03-15] Favorite color is teal\n</memory_context>",
    });

    expect(prompt).toContain("Favorite color is teal");
    expect(prompt).toContain("valid since");
    expect(prompt).toContain("Historical facts provide context");
  });

  it("injects recent action context when available", () => {
    const prompt = buildHandleSystemPrompt({
      memoryContext: "<recent_actions>\nRecent actions you've taken in this conversation:\n- Created file /tmp/a.txt\n</recent_actions>",
    });

    expect(prompt).toContain("Recent actions you've taken in this conversation");
    expect(prompt).toContain("Created file /tmp/a.txt");
  });

  it("instructs the agent to surface local shell rate limits", () => {
    const prompt = buildHandleSystemPrompt({
      backendId: "local",
      workspaceDir: "/Users/perlantir/Documents/Handle/workspaces/task-local",
    });

    expect(prompt).toContain("Shell execution rate limit exceeded");
    expect(prompt).toContain("batching commands");
    expect(prompt).toContain("do not assume files, shell state, browser tabs, or sandbox state");
  });
});
