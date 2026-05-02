import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { createComputerUseToolDefinitions } from "./computerUseTools";
import type { ToolExecutionContext } from "./toolRegistry";

function desktopContext(): ToolExecutionContext {
  return {
    sandbox: {
      commands: {
        async run() {
          return { exitCode: 0, stderr: "", stdout: "" };
        },
      },
      files: {
        async list() {
          return [];
        },
        async read() {
          return "";
        },
        async write() {
          return {};
        },
      },
      async kill() {},
      async leftClick() {},
      async moveMouse() {},
      async press() {},
      sandboxId: "desktop-agent-test",
      async screenshot() {
        return Buffer.from("png");
      },
      async write() {},
    } as ToolExecutionContext["sandbox"],
    taskId: "task-computer-use-tool-test",
  };
}

describe("computerUseTools", () => {
  it("delegates visible desktop tasks to Anthropic computer-use with the task sandbox", async () => {
    const runComputerUse = vi.fn().mockResolvedValue({
      finalText:
        "I see an empty desktop. A panel is visible. The screen is ready.",
      iterations: 2,
      screenshots: [],
      stopReason: "end_turn",
    });
    const definition = createComputerUseToolDefinitions({ runComputerUse })[0]!;
    const result = await definition.implementation(
      { goal: "Take a screenshot of the desktop.", maxIterations: 3 },
      desktopContext(),
    );

    expect(result).toContain("empty desktop");
    expect(runComputerUse).toHaveBeenCalledWith(
      expect.objectContaining({
        maxIterations: 3,
        prompt: "Take a screenshot of the desktop.",
        sandbox: expect.objectContaining({ sandboxId: "desktop-agent-test" }),
        taskId: "task-computer-use-tool-test",
      }),
    );
  });

  it("returns a clear error when a desktop task is routed to a headless sandbox", async () => {
    const definition = createComputerUseToolDefinitions({
      runComputerUse: vi.fn(),
    })[0]!;
    const context: ToolExecutionContext = {
      sandbox: {
        commands: {
          async run() {
            return { exitCode: 0, stderr: "", stdout: "" };
          },
        },
        files: {
          async list() {
            return [];
          },
          async read() {
            return "";
          },
          async write() {
            return {};
          },
        },
        async kill() {},
        sandboxId: "headless-test",
      },
      taskId: "task-computer-use-headless-test",
    };

    await expect(
      definition.implementation({ goal: "Take a screenshot." }, context),
    ).rejects.toThrow("requires an E2B Desktop sandbox");
  });
});
