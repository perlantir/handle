import { randomUUID } from "node:crypto";
import { z } from "zod";
import { awaitApproval } from "../approvals/approvalWaiter";
import type { BrowserSession } from "../execution/browserSession";
import { emitBrowserScreenshotEvent } from "../lib/browserScreenshotEvents";
import { emitTaskEvent } from "../lib/eventBus";
import { redactSecrets } from "../lib/redact";
import type { ToolDefinition, ToolExecutionContext } from "./toolRegistry";
import { displayToolName } from "./toolRegistry";

const navigateInput = z.object({
  url: z.string().url().describe("The URL to navigate to."),
});

const selectorInput = z.object({
  selector: z.string().min(1).describe("CSS selector for the target element."),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

const typeInput = selectorInput.extend({
  text: z.string().min(1).describe("Text to type into the selected element."),
});

const extractTextInput = z.object({
  selector: z.string().min(1).optional().describe("Optional CSS selector. Defaults to body."),
});

const scrollInput = z.object({
  amount: z.number().int().positive().max(10_000).optional(),
  direction: z.enum(["up", "down"]),
});

const screenshotInput = z.object({});

const goBackInput = z.object({
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

type BrowserToolInput = z.infer<typeof navigateInput>;
const BROWSER_SCREENSHOT_WIDTH = 1280;
const BROWSER_SCREENSHOT_HEIGHT = 800;

function emitBrowserToolCall(
  context: ToolExecutionContext,
  toolName: string,
  args: Record<string, unknown>,
) {
  const callId = randomUUID();

  emitTaskEvent({
    args: redactArgs(args),
    callId,
    taskId: context.taskId,
    toolName: displayToolName(toolName),
    type: "tool_call",
  });

  return callId;
}

function emitBrowserToolStream(
  context: ToolExecutionContext,
  callId: string,
  content: string,
  channel: "stdout" | "stderr" = "stdout",
) {
  emitTaskEvent({
    callId,
    channel,
    content: redactSecrets(content),
    taskId: context.taskId,
    type: "tool_stream",
  });
}

function emitBrowserToolResult(
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

function redactArgs(args: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    redacted[key] = typeof value === "string" ? redactSecrets(value) : value;
  }
  return redacted;
}

async function getBrowserSession(context: ToolExecutionContext): Promise<BrowserSession> {
  if (context.browserSession) return context.browserSession;

  context.browserSession = await context.backend.browserSession({
    approval: {
      requestApproval: ({ request, taskId }) => awaitApproval(taskId, request),
      taskId: context.taskId,
      trustedDomains: context.trustedDomains ?? [],
    },
  });
  return context.browserSession;
}

function screenshotStream(image: Buffer) {
  return `[screenshot]${image.toString("base64")}[/screenshot]`;
}

function emitBrowserScreenshot(context: ToolExecutionContext, callId: string, image?: Buffer) {
  if (!image) return;

  emitBrowserScreenshotEvent({
    callId,
    height: BROWSER_SCREENSHOT_HEIGHT,
    image,
    source: "browser_tools",
    taskId: context.taskId,
    width: BROWSER_SCREENSHOT_WIDTH,
  });
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function browserTool(
  definition: Omit<ToolDefinition, "backendSupport" | "requiresApproval">,
): ToolDefinition {
  return {
    ...definition,
    backendSupport: { e2b: true, local: true },
    requiresApproval: false,
  };
}

export function createBrowserToolDefinitions(): ToolDefinition[] {
  return [
    browserTool({
      description:
        "Navigate the headed sandbox browser to a URL. Use this for deterministic DOM-based browser tasks.",
      inputSchema: navigateInput,
      name: "browser_navigate",
      sideEffectClass: "network",
      async implementation(input, context) {
        const parsed = navigateInput.parse(input) satisfies BrowserToolInput;
        const callId = emitBrowserToolCall(context, "browser_navigate", parsed);
        emitBrowserToolStream(context, callId, `Navigating to ${parsed.url}`);

        try {
          const session = await getBrowserSession(context);
          const result = await session.navigate(parsed.url);
          emitBrowserToolStream(
            context,
            callId,
            `Navigation complete. Title: "${result.title}". Screenshot bytes: ${result.screenshot.byteLength}`,
          );
          emitBrowserToolStream(context, callId, screenshotStream(result.screenshot));
          emitBrowserScreenshot(context, callId, result.screenshot);
          const output = `Navigated to ${result.url}. Title: "${result.title}".`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Click the first element matching a CSS selector in the headed sandbox browser.",
      inputSchema: selectorInput,
      name: "browser_click",
      sideEffectClass: "write",
      async implementation(input, context) {
        const parsed = selectorInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_click", parsed);
        emitBrowserToolStream(context, callId, `Clicking selector ${parsed.selector}`);

        try {
          const session = await getBrowserSession(context);
          const result = await session.click(parsed.selector, {
            includeScreenshot: true,
            ...(parsed.timeoutMs ? { timeoutMs: parsed.timeoutMs } : {}),
          });
          emitBrowserScreenshot(context, callId, result.screenshot);
          const output = `Clicked ${parsed.selector}. Current URL: ${result.url}. Title: "${result.title}".`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Type text into the first element matching a CSS selector in the headed sandbox browser.",
      inputSchema: typeInput,
      name: "browser_type",
      sideEffectClass: "write",
      async implementation(input, context) {
        const parsed = typeInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_type", {
          selector: parsed.selector,
          textLength: parsed.text.length,
          ...(parsed.timeoutMs ? { timeoutMs: parsed.timeoutMs } : {}),
        });
        emitBrowserToolStream(
          context,
          callId,
          `Typing ${parsed.text.length} characters into ${parsed.selector}`,
        );

        try {
          const session = await getBrowserSession(context);
          const result = await session.type(parsed.selector, parsed.text, {
            includeScreenshot: true,
            ...(parsed.timeoutMs ? { timeoutMs: parsed.timeoutMs } : {}),
          });
          emitBrowserScreenshot(context, callId, result.screenshot);
          const output = `Typed ${parsed.text.length} characters into ${parsed.selector}. Current URL: ${result.url}.`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description:
        "Extract visible text from the current page, optionally scoped to the first element matching a CSS selector.",
      inputSchema: extractTextInput,
      name: "browser_extract_text",
      sideEffectClass: "read",
      async implementation(input, context) {
        const parsed = extractTextInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_extract_text", parsed);
        emitBrowserToolStream(
          context,
          callId,
          `Extracting text from ${parsed.selector ?? "body"}`,
        );

        try {
          const session = await getBrowserSession(context);
          const text = await session.extractText(parsed.selector);
          const redacted = redactSecrets(text);
          emitBrowserToolStream(
            context,
            callId,
            `Extracted ${Buffer.byteLength(redacted)} bytes of text`,
          );
          emitBrowserToolResult(context, callId, redacted);
          return redacted;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Take a PNG screenshot of the current headed sandbox browser viewport.",
      inputSchema: screenshotInput,
      name: "browser_screenshot",
      sideEffectClass: "read",
      async implementation(input, context) {
        screenshotInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_screenshot", {});
        emitBrowserToolStream(context, callId, "Taking browser screenshot");

        try {
          const session = await getBrowserSession(context);
          const image = await session.screenshot();
          emitBrowserToolStream(
            context,
            callId,
            `Browser screenshot captured: ${image.byteLength} bytes`,
          );
          emitBrowserToolStream(context, callId, screenshotStream(image));
          emitBrowserScreenshot(context, callId, image);
          const output = `Captured browser screenshot (${image.byteLength} bytes).`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Go back one entry in the headed sandbox browser history.",
      inputSchema: goBackInput,
      name: "browser_go_back",
      sideEffectClass: "network",
      async implementation(input, context) {
        const parsed = goBackInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_go_back", parsed);
        emitBrowserToolStream(context, callId, "Going back in browser history");

        try {
          const session = await getBrowserSession(context);
          const result = await session.goBack({
            ...(parsed.timeoutMs ? { timeoutMs: parsed.timeoutMs } : {}),
          });
          const output = `Went back. Current URL: ${result.url}. Title: "${result.title}".`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Scroll the current page up or down by a pixel amount.",
      inputSchema: scrollInput,
      name: "browser_scroll",
      sideEffectClass: "read",
      async implementation(input, context) {
        const parsed = scrollInput.parse(input);
        const amount = parsed.amount ?? 600;
        const callId = emitBrowserToolCall(context, "browser_scroll", {
          amount,
          direction: parsed.direction,
        });
        emitBrowserToolStream(context, callId, `Scrolling ${parsed.direction} by ${amount}px`);

        try {
          const session = await getBrowserSession(context);
          const result = await session.scroll(parsed.direction, amount);
          emitBrowserScreenshot(context, callId, result.screenshot);
          const output = `Scrolled ${parsed.direction} by ${amount}px. Current URL: ${result.url}.`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
    browserTool({
      description: "Wait for the first element matching a CSS selector to appear.",
      inputSchema: selectorInput,
      name: "browser_wait_for_selector",
      sideEffectClass: "read",
      async implementation(input, context) {
        const parsed = selectorInput.parse(input);
        const callId = emitBrowserToolCall(context, "browser_wait_for_selector", parsed);
        emitBrowserToolStream(context, callId, `Waiting for selector ${parsed.selector}`);

        try {
          const session = await getBrowserSession(context);
          const result = await session.waitForSelector(parsed.selector, {
            ...(parsed.timeoutMs ? { timeoutMs: parsed.timeoutMs } : {}),
          });
          const output = `Selector ${parsed.selector} is visible. Current URL: ${result.url}.`;
          emitBrowserToolResult(context, callId, output);
          return output;
        } catch (err) {
          const message = errorMessage(err);
          emitBrowserToolResult(context, callId, "", message);
          throw err;
        }
      },
    }),
  ];
}
