import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DesktopSandboxHandle } from "../execution/desktopSandbox";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import {
  runAnthropicComputerUseTask,
  type RunAnthropicComputerUseTaskOptions,
} from "../providers/anthropicComputerUse";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

const computerUseInput = z.object({
  goal: z
    .string()
    .min(1)
    .describe(
      "The visual desktop task to perform with Anthropic computer-use.",
    ),
  maxIterations: z.number().int().positive().max(20).optional(),
});

interface DesktopCapableSandbox {
  kill(): Promise<void>;
  leftClick(x?: number, y?: number): Promise<void>;
  moveMouse(x: number, y: number): Promise<void>;
  press(key: string | string[]): Promise<void>;
  sandboxId?: string;
  screenshot(): Promise<Uint8Array>;
  write(text: string): Promise<void>;
}

function emitComputerUseToolCall(
  context: ToolExecutionContext,
  args: Record<string, unknown>,
) {
  const callId = randomUUID();

  emitTaskEvent({
    args,
    callId,
    taskId: context.taskId,
    toolName: displayToolName("computer_use"),
    type: "tool_call",
  });

  return callId;
}

function emitComputerUseToolStream(
  context: ToolExecutionContext,
  callId: string,
  content: string,
) {
  emitTaskEvent({
    callId,
    channel: "stdout",
    content: redactSecrets(content),
    taskId: context.taskId,
    type: "tool_stream",
  });
}

function emitComputerUseToolResult(
  context: ToolExecutionContext,
  callId: string,
  result: string,
  error?: string,
) {
  emitTaskEvent({
    callId,
    result: redactSecrets(result),
    taskId: context.taskId,
    type: "tool_result",
    ...(error ? { error: redactSecrets(error) } : {}),
  });
}

function isDesktopCapableSandbox(
  sandbox: ToolExecutionContext["sandbox"],
): sandbox is ToolExecutionContext["sandbox"] & DesktopCapableSandbox {
  const candidate = sandbox as Partial<DesktopCapableSandbox>;
  return (
    typeof candidate.screenshot === "function" &&
    typeof candidate.moveMouse === "function" &&
    typeof candidate.leftClick === "function" &&
    typeof candidate.write === "function" &&
    typeof candidate.press === "function"
  );
}

function desktopHandleFromSandbox(
  sandbox: ToolExecutionContext["sandbox"],
): DesktopSandboxHandle {
  if (!isDesktopCapableSandbox(sandbox)) {
    throw new Error(
      "computer_use requires an E2B Desktop sandbox with screenshot, mouse, and keyboard controls. This task was routed to a headless sandbox.",
    );
  }

  return {
    async click(x, y) {
      await sandbox.moveMouse(x, y);
      await sandbox.leftClick();
    },
    async key(name) {
      await sandbox.press(name);
    },
    async kill() {
      // The task runner owns sandbox lifecycle. Do not kill from the tool.
    },
    sandboxId: sandbox.sandboxId ?? "unknown",
    async screenshot() {
      return Buffer.from(await sandbox.screenshot());
    },
    async type(text) {
      await sandbox.write(text);
    },
  };
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function createComputerUseToolDefinitions({
  runComputerUse = runAnthropicComputerUseTask,
}: {
  runComputerUse?: typeof runAnthropicComputerUseTask;
} = {}): ToolDefinition[] {
  return [
    {
      backendSupport: { e2b: true, local: false },
      description:
        "Use Anthropic computer-use to inspect and control the visible E2B Desktop sandbox. Use this for desktop screenshots, visual desktop descriptions, coordinate-based clicking, and GUI tasks. Do not use shell_exec to capture desktop screenshots.",
      inputSchema: computerUseInput,
      name: "computer_use",
      requiresApproval: false,
      sideEffectClass: "execute",
      async implementation(input, context) {
        const parsed = computerUseInput.parse(input);
        const callId = emitComputerUseToolCall(context, {
          goal: parsed.goal,
          ...(parsed.maxIterations
            ? { maxIterations: parsed.maxIterations }
            : {}),
        });
        emitComputerUseToolStream(
          context,
          callId,
          "Starting Anthropic computer-use task",
        );

        try {
          const options: RunAnthropicComputerUseTaskOptions = {
            maxIterations: parsed.maxIterations ?? 8,
            prompt: parsed.goal,
            sandbox: desktopHandleFromSandbox(context.sandbox),
            taskId: context.taskId,
            taskLabel: `task:${context.taskId}:computer_use`,
            onScreenshot({ action, byteCount, iteration }) {
              emitComputerUseToolStream(
                context,
                callId,
                `Screenshot after ${action} in iteration ${iteration}: ${byteCount} bytes`,
              );
            },
          };
          const result = await runComputerUse(options);
          const output = result.finalText || "Computer-use task completed.";
          emitComputerUseToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitComputerUseToolResult(context, callId, "", message);
          throw err;
        }
      },
    },
  ];
}
