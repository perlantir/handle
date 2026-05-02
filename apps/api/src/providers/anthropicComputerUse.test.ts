import type {
  BetaMessage,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages";
import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import type { DesktopSandboxHandle } from "../execution/desktopSandbox";
import {
  ANTHROPIC_BASH_TOOL_TYPE,
  ANTHROPIC_COMPUTER_TOOL_TYPE,
  ANTHROPIC_COMPUTER_USE_BETA,
  ANTHROPIC_COMPUTER_USE_MODEL,
  ANTHROPIC_TEXT_EDITOR_TOOL_TYPE,
  UNSUPPORTED_PHASE_3_TOOL_MESSAGE,
  createAnthropicComputerUseRequest,
  createAnthropicComputerUseTools,
  executeAnthropicComputerToolUse,
  runAnthropicComputerUseTask,
} from "./anthropicComputerUse";

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

function createSandbox(overrides: Partial<DesktopSandboxHandle> = {}) {
  return {
    async click() {},
    async key() {},
    async kill() {},
    sandboxId: "desktop-test",
    async screenshot() {
      return Buffer.from("fake-png");
    },
    async type() {},
    ...overrides,
  } satisfies DesktopSandboxHandle;
}

function toolUse(
  overrides: Partial<BetaToolUseBlock> & { input?: unknown },
): BetaToolUseBlock {
  return {
    id: "toolu_test",
    input: {},
    name: "computer",
    type: "tool_use",
    ...overrides,
  };
}

function message(overrides: Partial<BetaMessage>): BetaMessage {
  return {
    content: [],
    id: "msg_test",
    model: ANTHROPIC_COMPUTER_USE_MODEL,
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      inference_geo: null,
      input_tokens: 1,
      iterations: null,
      output_tokens: 1,
      server_tool_use: null,
      service_tier: "standard",
      speed: null,
    },
    ...overrides,
  } as BetaMessage;
}

describe("Anthropic computer-use provider mode", () => {
  it("builds current Anthropic computer-use tool definitions", () => {
    const tools = createAnthropicComputerUseTools([1024, 768]);

    expect(tools).toEqual([
      {
        display_height_px: 768,
        display_width_px: 1024,
        name: "computer",
        type: ANTHROPIC_COMPUTER_TOOL_TYPE,
      },
      { name: "bash", type: ANTHROPIC_BASH_TOOL_TYPE },
      {
        max_characters: 10_000,
        name: "str_replace_based_edit_tool",
        type: ANTHROPIC_TEXT_EDITOR_TOOL_TYPE,
      },
    ]);
  });

  it("creates requests with beta header and no sampler defaults", () => {
    const request = createAnthropicComputerUseRequest({
      messages: [{ content: "look", role: "user" }],
    });

    expect(request.betas).toEqual([ANTHROPIC_COMPUTER_USE_BETA]);
    expect(request.model).toBe(ANTHROPIC_COMPUTER_USE_MODEL);
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("top_p");
    expect(request).not.toHaveProperty("top_k");
  });

  it("translates screenshot actions into image tool_result blocks", async () => {
    const logger = createLogger();
    const image = Buffer.from([1, 2, 3, 4]);
    const sandbox = createSandbox({
      screenshot: vi.fn(async () => image),
    });
    const onScreenshot = vi.fn();

    const result = await executeAnthropicComputerToolUse({
      iteration: 1,
      log: logger,
      onScreenshot,
      sandbox,
      toolUse: toolUse({ input: { action: "screenshot" } }),
    });

    expect(sandbox.screenshot).toHaveBeenCalledOnce();
    expect(onScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ byteCount: 4, image }),
    );
    expect(result).toEqual({
      content: [
        {
          source: {
            data: image.toString("base64"),
            media_type: "image/png",
            type: "base64",
          },
          type: "image",
        },
        { text: "Screenshot captured (4 bytes).", type: "text" },
      ],
      tool_use_id: "toolu_test",
      type: "tool_result",
    });
  });

  it("translates click, type, and key actions to desktop sandbox calls", async () => {
    const logger = createLogger();
    const sandbox = createSandbox({
      click: vi.fn(async () => {}),
      key: vi.fn(async () => {}),
      type: vi.fn(async () => {}),
    });

    await executeAnthropicComputerToolUse({
      iteration: 1,
      log: logger,
      sandbox,
      toolUse: toolUse({ input: { action: "left_click", coordinate: [10, 20] } }),
    });
    await executeAnthropicComputerToolUse({
      iteration: 1,
      log: logger,
      sandbox,
      toolUse: toolUse({ input: { action: "click", coordinate: [30, 40] } }),
    });
    await executeAnthropicComputerToolUse({
      iteration: 2,
      log: logger,
      sandbox,
      toolUse: toolUse({ input: { action: "type", text: "hello" } }),
    });
    await executeAnthropicComputerToolUse({
      iteration: 3,
      log: logger,
      sandbox,
      toolUse: toolUse({ input: { action: "key", key: "Enter" } }),
    });

    expect(sandbox.click).toHaveBeenCalledWith(10, 20);
    expect(sandbox.click).toHaveBeenCalledWith(30, 40);
    expect(sandbox.type).toHaveBeenCalledWith("hello");
    expect(sandbox.key).toHaveBeenCalledWith("Enter");
  });

  it("returns explicit unsupported errors for bash and text editor tools", async () => {
    const sandbox = createSandbox();
    const logger = createLogger();

    await expect(
      executeAnthropicComputerToolUse({
        iteration: 1,
        log: logger,
        sandbox,
        toolUse: toolUse({ name: "bash" }),
      }),
    ).resolves.toEqual({
      content: UNSUPPORTED_PHASE_3_TOOL_MESSAGE,
      is_error: true,
      tool_use_id: "toolu_test",
      type: "tool_result",
    });

    await expect(
      executeAnthropicComputerToolUse({
        iteration: 1,
        log: logger,
        sandbox,
        toolUse: toolUse({ name: "str_replace_based_edit_tool" }),
      }),
    ).resolves.toEqual({
      content: UNSUPPORTED_PHASE_3_TOOL_MESSAGE,
      is_error: true,
      tool_use_id: "toolu_test",
      type: "tool_result",
    });
  });

  it("runs a basic agent loop against a mocked Anthropic client", async () => {
    const screenshotToolUse = toolUse({
      input: { action: "screenshot" },
    });
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        message({
          content: [screenshotToolUse],
          stop_reason: "tool_use",
        }),
      )
      .mockResolvedValueOnce(
        message({
          content: [
            {
              citations: null,
              text: "I see an empty desktop. A panel is visible. The screen is ready.",
              type: "text",
            },
          ],
        }),
      );
    const client = {
      beta: {
        messages: { create },
      },
    };
    const sandbox = createSandbox({
      kill: vi.fn(async () => {}),
      screenshot: vi.fn(async () => Buffer.from("screen")),
    });

    const result = await runAnthropicComputerUseTask({
      client,
      logger: createLogger(),
      prompt: "Take a screenshot.",
      sandbox,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages.at(-1)).toEqual({
      content: [
        expect.objectContaining({
          tool_use_id: "toolu_test",
          type: "tool_result",
        }),
      ],
      role: "user",
    });
    expect(result.finalText).toContain("empty desktop");
    expect(result.screenshots).toHaveLength(1);
    expect(sandbox.kill).not.toHaveBeenCalled();
  });
});
