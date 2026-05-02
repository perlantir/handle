import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages";
import type { Buffer } from "node:buffer";
import { createDesktopSandbox } from "../execution/desktopSandbox";
import type { DesktopSandboxHandle } from "../execution/desktopSandbox";
import { emitBrowserScreenshotEvent } from "../lib/browserScreenshotEvents";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import { logger } from "../lib/logger";

export const ANTHROPIC_COMPUTER_USE_MODEL = "claude-opus-4-7";
export const ANTHROPIC_COMPUTER_USE_BETA = "computer-use-2025-11-24";
export const ANTHROPIC_COMPUTER_TOOL_TYPE = "computer_20251124";
export const ANTHROPIC_BASH_TOOL_TYPE = "bash_20250124";
export const ANTHROPIC_TEXT_EDITOR_TOOL_TYPE = "text_editor_20250728";
export const ANTHROPIC_COMPUTER_USE_MAX_ITERATIONS = 8;
export const UNSUPPORTED_PHASE_3_TOOL_MESSAGE =
  "This tool is not yet wired in Phase 3 step 2. Use computer_20251124 actions (screenshot, click, type, key) instead.";

export interface AnthropicComputerUseClient {
  beta: {
    messages: {
      create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage>;
    };
  };
}

export interface ComputerUseLogger {
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn?(payload: Record<string, unknown>, message: string): void;
}

export interface ScreenshotArtifact {
  action: string;
  byteCount: number;
  image: Buffer;
  iteration: number;
  toolUseId: string;
}

export interface RunAnthropicComputerUseTaskOptions {
  client?: AnthropicComputerUseClient;
  createSandbox?: typeof createDesktopSandbox;
  getCredential?: typeof defaultGetCredential;
  logger?: ComputerUseLogger;
  maxIterations?: number;
  maxTokens?: number;
  model?: string;
  onScreenshot?: (artifact: ScreenshotArtifact) => void | Promise<void>;
  prompt: string;
  resolution?: [number, number];
  sandbox?: DesktopSandboxHandle;
  system?: string;
  taskId?: string;
  taskLabel?: string;
}

export interface AnthropicComputerUseTaskResult {
  finalText: string;
  iterations: number;
  screenshots: ScreenshotArtifact[];
  stopReason: BetaMessage["stop_reason"];
}

interface ComputerToolInput {
  action?: unknown;
  coordinate?: unknown;
  key?: unknown;
  text?: unknown;
}

function durationSince(startedAt: number) {
  return Date.now() - startedAt;
}

function asObject(input: unknown): ComputerToolInput {
  if (typeof input === "object" && input !== null) return input;
  return {};
}

function coordinate(input: ComputerToolInput) {
  if (
    Array.isArray(input.coordinate) &&
    input.coordinate.length >= 2 &&
    typeof input.coordinate[0] === "number" &&
    typeof input.coordinate[1] === "number"
  ) {
    return [input.coordinate[0], input.coordinate[1]] as const;
  }

  throw new Error("computer action requires coordinate [x, y]");
}

function textInput(input: ComputerToolInput) {
  if (typeof input.text === "string") return input.text;
  throw new Error("computer type action requires text");
}

function keyInput(input: ComputerToolInput) {
  if (typeof input.key === "string") return input.key;
  if (typeof input.text === "string") return input.text;
  throw new Error("computer key action requires key");
}

function textBlocks(content: BetaContentBlock[]) {
  return content
    .filter((block): block is BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function toolUses(content: BetaContentBlock[]) {
  return content.filter(
    (block): block is BetaToolUseBlock => block.type === "tool_use",
  );
}

function errorToolResult(toolUseId: string, message: string) {
  return {
    content: message,
    is_error: true,
    tool_use_id: toolUseId,
    type: "tool_result",
  } satisfies BetaToolResultBlockParam;
}

export function createAnthropicComputerUseTools(
  resolution: [number, number] = [1024, 768],
) {
  const [width, height] = resolution;

  return [
    {
      display_height_px: height,
      display_width_px: width,
      name: "computer",
      type: ANTHROPIC_COMPUTER_TOOL_TYPE,
    },
    {
      name: "bash",
      type: ANTHROPIC_BASH_TOOL_TYPE,
    },
    {
      max_characters: 10_000,
      name: "str_replace_based_edit_tool",
      type: ANTHROPIC_TEXT_EDITOR_TOOL_TYPE,
    },
  ] satisfies BetaToolUnion[];
}

export function createAnthropicComputerUseRequest({
  maxTokens = 2048,
  messages,
  model = ANTHROPIC_COMPUTER_USE_MODEL,
  resolution,
  system,
}: {
  maxTokens?: number;
  messages: BetaMessageParam[];
  model?: string;
  resolution?: [number, number];
  system?: string;
}) {
  return {
    betas: [ANTHROPIC_COMPUTER_USE_BETA],
    max_tokens: maxTokens,
    messages: [...messages],
    model,
    ...(system ? { system } : {}),
    tools: createAnthropicComputerUseTools(resolution),
  } satisfies MessageCreateParamsNonStreaming;
}

export async function executeAnthropicComputerToolUse({
  iteration,
  log = logger,
  onScreenshot,
  sandbox,
  toolUse,
}: {
  iteration: number;
  log?: ComputerUseLogger;
  onScreenshot?: (artifact: ScreenshotArtifact) => void | Promise<void>;
  sandbox: DesktopSandboxHandle;
  toolUse: BetaToolUseBlock;
}) {
  const startedAt = Date.now();

  if (toolUse.name !== "computer") {
    log.info(
      {
        iteration,
        toolName: toolUse.name,
        toolUseId: toolUse.id,
      },
      "Anthropic computer-use unsupported tool requested",
    );

    return errorToolResult(toolUse.id, UNSUPPORTED_PHASE_3_TOOL_MESSAGE);
  }

  const input = asObject(toolUse.input);
  const action = typeof input.action === "string" ? input.action : "unknown";

  log.info(
    {
      action,
      iteration,
      sandboxId: sandbox.sandboxId,
      toolUseId: toolUse.id,
    },
    "Anthropic computer-use action started",
  );

  try {
    async function captureActionScreenshot(actionName: string) {
      const image = await sandbox.screenshot();
      const artifact = {
        action: actionName,
        byteCount: image.byteLength,
        image,
        iteration,
        toolUseId: toolUse.id,
      };
      await onScreenshot?.(artifact);
      return artifact;
    }

    if (action === "screenshot") {
      const artifact = await captureActionScreenshot(action);
      const { image } = artifact;

      log.info(
        {
          action,
          byteCount: image.byteLength,
          durationMs: durationSince(startedAt),
          iteration,
          sandboxId: sandbox.sandboxId,
          toolUseId: toolUse.id,
        },
        "Anthropic computer-use action complete",
      );

      return {
        content: [
          {
            source: {
              data: image.toString("base64"),
              media_type: "image/png",
              type: "base64",
            },
            type: "image",
          },
          {
            text: `Screenshot captured (${image.byteLength} bytes).`,
            type: "text",
          },
        ],
        tool_use_id: toolUse.id,
        type: "tool_result",
      } satisfies BetaToolResultBlockParam;
    }

    if (action === "left_click" || action === "click") {
      const [x, y] = coordinate(input);
      await sandbox.click(x, y);
      await captureActionScreenshot(action);
      return actionCompleteToolResult(toolUse.id, startedAt, log, {
        action,
        iteration,
        sandboxId: sandbox.sandboxId,
        text: `Clicked at (${x}, ${y}).`,
        toolUseId: toolUse.id,
        x,
        y,
      });
    }

    if (action === "type") {
      const text = textInput(input);
      await sandbox.type(text);
      await captureActionScreenshot(action);
      return actionCompleteToolResult(toolUse.id, startedAt, log, {
        action,
        charCount: text.length,
        iteration,
        sandboxId: sandbox.sandboxId,
        text: `Typed ${text.length} characters.`,
        toolUseId: toolUse.id,
      });
    }

    if (action === "key") {
      const key = keyInput(input);
      await sandbox.key(key);
      await captureActionScreenshot(action);
      return actionCompleteToolResult(toolUse.id, startedAt, log, {
        action,
        iteration,
        key,
        sandboxId: sandbox.sandboxId,
        text: `Pressed key ${key}.`,
        toolUseId: toolUse.id,
      });
    }

    return errorToolResult(
      toolUse.id,
      `Unsupported computer_20251124 action "${action}" in Phase 3 step 2. Supported actions: screenshot, left_click, type, key.`,
    );
  } catch (err) {
    log.error(
      {
        action,
        durationMs: durationSince(startedAt),
        err,
        iteration,
        sandboxId: sandbox.sandboxId,
        toolUseId: toolUse.id,
      },
      "Anthropic computer-use action failed",
    );

    return errorToolResult(
      toolUse.id,
      err instanceof Error ? err.message : "Unknown computer-use action failure",
    );
  }
}

function actionCompleteToolResult(
  toolUseId: string,
  startedAt: number,
  log: ComputerUseLogger,
  payload: Record<string, unknown> & { text: string },
) {
  const { text, ...logPayload } = payload;

  log.info(
    {
      ...logPayload,
      durationMs: durationSince(startedAt),
    },
    "Anthropic computer-use action complete",
  );

  return {
    content: text,
    tool_use_id: toolUseId,
    type: "tool_result",
  } satisfies BetaToolResultBlockParam;
}

export async function runAnthropicComputerUseTask({
  client,
  createSandbox = createDesktopSandbox,
  getCredential = defaultGetCredential,
  logger: log = logger,
  maxIterations = ANTHROPIC_COMPUTER_USE_MAX_ITERATIONS,
  maxTokens = 2048,
  model = ANTHROPIC_COMPUTER_USE_MODEL,
  onScreenshot,
  prompt,
  resolution = [1024, 768],
  sandbox: providedSandbox,
  system = "You are controlling a sandboxed Linux desktop through the computer tool. In Phase 3 step 2, bash and text editor tools are intentionally not wired. Use only computer_20251124 actions: screenshot, left_click, type, and key. After each action, inspect the screenshot result before deciding whether to continue.",
  taskId,
  taskLabel = "computer-use-task",
}: RunAnthropicComputerUseTaskOptions): Promise<AnthropicComputerUseTaskResult> {
  const startedAt = Date.now();
  const screenshots: ScreenshotArtifact[] = [];
  let sandbox = providedSandbox;
  let ownsSandbox = false;

  log.info(
    { maxIterations, model, resolution, taskLabel },
    "Anthropic computer-use task started",
  );

  try {
    if (!client) {
      const apiKey = await getCredential("anthropic:apiKey");
      client = new Anthropic({ apiKey });
    }

    if (!sandbox) {
      sandbox = await createSandbox({ resolution });
      ownsSandbox = true;
    }
    const activeSandbox = sandbox;

    const messages: BetaMessageParam[] = [{ content: prompt, role: "user" }];
    let finalText = "";
    let stopReason: BetaMessage["stop_reason"] = null;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const iterationStartedAt = Date.now();
      const request = createAnthropicComputerUseRequest({
        maxTokens,
        messages,
        model,
        resolution,
        system,
      });

      log.info(
        {
          iteration,
          messageCount: messages.length,
          model,
          taskLabel,
        },
        "Anthropic computer-use model invocation started",
      );

      const response = await client.beta.messages.create(request);
      stopReason = response.stop_reason;
      const uses = toolUses(response.content);

      log.info(
        {
          contentBlocks: response.content.length,
          durationMs: durationSince(iterationStartedAt),
          iteration,
          stopReason,
          taskLabel,
          toolUseCount: uses.length,
        },
        "Anthropic computer-use model invocation complete",
      );

      messages.push({
        content: response.content as BetaContentBlockParam[],
        role: "assistant",
      });

      if (uses.length === 0) {
        finalText = textBlocks(response.content);
        log.info(
          {
            durationMs: durationSince(startedAt),
            iterations: iteration,
            stopReason,
            taskLabel,
          },
          "Anthropic computer-use task complete",
        );
        return { finalText, iterations: iteration, screenshots, stopReason };
      }

      const toolResults = await Promise.all(
        uses.map((toolUse) =>
          executeAnthropicComputerToolUse({
            iteration,
            log,
            onScreenshot: async (artifact) => {
              screenshots.push(artifact);
              if (taskId) {
                emitBrowserScreenshotEvent({
                  callId: artifact.toolUseId,
                  height: resolution[1],
                  image: artifact.image,
                  source: "computer_use",
                  taskId,
                  width: resolution[0],
                });
              }
              await onScreenshot?.(artifact);
            },
            sandbox: activeSandbox,
            toolUse,
          }),
        ),
      );

      messages.push({ content: toolResults, role: "user" });
    }

    throw new Error(
      `Anthropic computer-use task reached maxIterations=${maxIterations} without a final text response.`,
    );
  } catch (err) {
    log.error(
      { durationMs: durationSince(startedAt), err, model, taskLabel },
      "Anthropic computer-use task failed",
    );
    throw err;
  } finally {
    if (ownsSandbox && sandbox) {
      await sandbox.kill();
    }
  }
}
