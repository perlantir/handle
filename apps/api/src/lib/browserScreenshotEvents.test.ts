import type { SSEEvent } from "@handle/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToTask } from "./eventBus";
import { emitBrowserScreenshotEvent, resetBrowserScreenshotThrottleForTest } from "./browserScreenshotEvents";

describe("browserScreenshotEvents", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBrowserScreenshotThrottleForTest();
  });

  it("emits screenshots and throttles bursts to the latest image", async () => {
    vi.useFakeTimers();
    const events: SSEEvent[] = [];
    const unsubscribe = subscribeToTask("task-screenshot", (event) => events.push(event));

    try {
      emitBrowserScreenshotEvent({
        callId: "call-1",
        height: 800,
        image: Buffer.from("first"),
        source: "browser_tools",
        taskId: "task-screenshot",
        width: 1280,
      });
      emitBrowserScreenshotEvent({
        callId: "call-2",
        height: 800,
        image: Buffer.from("second"),
        source: "browser_tools",
        taskId: "task-screenshot",
        width: 1280,
      });
      emitBrowserScreenshotEvent({
        callId: "call-3",
        height: 800,
        image: Buffer.from("third"),
        source: "browser_tools",
        taskId: "task-screenshot",
        width: 1280,
      });

      expect(events.filter((event) => event.type === "browser_screenshot")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(500);

      const screenshots = events.filter((event) => event.type === "browser_screenshot");
      expect(screenshots).toHaveLength(2);
      expect(screenshots.at(-1)).toMatchObject({
        byteCount: 5,
        callId: "call-3",
        imageBase64: Buffer.from("third").toString("base64"),
        source: "browser_tools",
      });
    } finally {
      unsubscribe();
    }
  });
});
