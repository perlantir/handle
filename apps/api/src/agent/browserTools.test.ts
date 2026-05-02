import { Buffer } from "node:buffer";
import type { SSEEvent } from "@handle/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../execution/browserSession";
import type { E2BSandboxLike } from "../execution/types";
import { resetBrowserScreenshotThrottleForTest } from "../lib/browserScreenshotEvents";
import { subscribeToTask } from "../lib/eventBus";
import { createBrowserToolDefinitions } from "./browserTools";
import type { ToolExecutionContext } from "./toolRegistry";

const unsubscribers: Array<() => void> = [];

afterEach(() => {
  while (unsubscribers.length) {
    unsubscribers.pop()?.();
  }
  resetBrowserScreenshotThrottleForTest();
});

function sandbox(): E2BSandboxLike {
  return {
    commands: {
      run: vi.fn(),
    },
    files: {
      list: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
    },
    kill: vi.fn(),
    sandboxId: "sandbox-browser-tools",
  };
}

function browserSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    click: vi.fn(async () => ({ title: "Clicked", url: "https://example.com/" })),
    destroy: vi.fn(),
    extractText: vi.fn(async () => "First HN Story"),
    goBack: vi.fn(async () => ({ title: "Back", url: "https://example.com/back" })),
    navigate: vi.fn(async () => ({
      screenshot: Buffer.from("screen"),
      title: "Hacker News",
      url: "https://news.ycombinator.com/",
    })),
    screenshot: vi.fn(async () => Buffer.from("screen")),
    scroll: vi.fn(async () => ({ title: "Scrolled", url: "https://example.com/" })),
    type: vi.fn(async () => ({ title: "Typed", url: "https://example.com/" })),
    waitForSelector: vi.fn(async () => ({ title: "Ready", url: "https://example.com/" })),
    ...overrides,
  };
}

function context(session = browserSession()): ToolExecutionContext {
  return {
    browserSession: session,
    sandbox: sandbox(),
    taskId: "task-browser-tools",
  };
}

function collectEvents(taskId: string) {
  const events: SSEEvent[] = [];
  const unsubscribe = subscribeToTask(taskId, (event) => events.push(event));
  unsubscribers.push(unsubscribe);
  return events;
}

function tool(name: string) {
  const definition = createBrowserToolDefinitions().find((item) => item.name === name);
  if (!definition) throw new Error(`Missing browser tool ${name}`);
  return definition;
}

describe("browserTools", () => {
  it("declares the expected DOM browser tool surface", () => {
    const definitions = createBrowserToolDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual([
      "browser_navigate",
      "browser_click",
      "browser_type",
      "browser_extract_text",
      "browser_screenshot",
      "browser_go_back",
      "browser_scroll",
      "browser_wait_for_selector",
    ]);
    expect(definitions.every((definition) => definition.backendSupport.e2b)).toBe(true);
    expect(definitions.every((definition) => definition.requiresApproval === false)).toBe(true);
  });

  it("emits tool_call, screenshot tool_stream, and tool_result for navigate", async () => {
    const events = collectEvents("task-browser-tools");
    const session = browserSession();

    const result = await tool("browser_navigate").implementation(
      { url: "https://news.ycombinator.com" },
      context(session),
    );

    expect(result).toContain('Title: "Hacker News"');
    expect(session.navigate).toHaveBeenCalledWith("https://news.ycombinator.com");
    expect(events.map((event) => event.type)).toEqual([
      "tool_call",
      "tool_stream",
      "tool_stream",
      "tool_stream",
      "browser_screenshot",
      "tool_result",
    ]);
    expect(events[0]).toMatchObject({
      toolName: "browser.navigate",
      type: "tool_call",
    });
    expect(events.some((event) => event.type === "tool_stream" && event.content.includes("[screenshot]"))).toBe(
      true,
    );
    expect(events.some((event) => event.type === "browser_screenshot" && event.byteCount === 6)).toBe(true);
  });

  it("extracts text through the browser session and reports byte count", async () => {
    const events = collectEvents("task-browser-tools");
    const session = browserSession({ extractText: vi.fn(async () => "Top Story") });

    const result = await tool("browser_extract_text").implementation(
      { selector: ".titleline > a" },
      context(session),
    );

    expect(result).toBe("Top Story");
    expect(session.extractText).toHaveBeenCalledWith(".titleline > a");
    expect(events.some((event) => event.type === "tool_stream" && event.content.includes("Extracted 9 bytes"))).toBe(
      true,
    );
  });

  it("emits a tool_result error when a browser action fails", async () => {
    const events = collectEvents("task-browser-tools");
    const session = browserSession({
      click: vi.fn(async () => {
        throw new Error("selector not found");
      }),
    });

    await expect(
      tool("browser_click").implementation({ selector: "#missing" }, context(session)),
    ).rejects.toThrow("selector not found");

    expect(events.at(-1)).toMatchObject({
      error: "selector not found",
      result: "",
      type: "tool_result",
    });
  });
});
