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
});
