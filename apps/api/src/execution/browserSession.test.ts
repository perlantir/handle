import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  createBrowserSession,
  type BrowserSessionLogger,
  type BrowserSessionSandbox,
} from "./browserSession";

function createLogger(): BrowserSessionLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function ok(stdout = JSON.stringify({ ok: true })) {
  return { exitCode: 0, stderr: "", stdout };
}

function fail(stdout = JSON.stringify({ ok: false, error: "browser crashed" })) {
  return { exitCode: 1, stderr: "browser crashed", stdout };
}

function actionResponse(result: Record<string, unknown>) {
  return ok(JSON.stringify({ ok: true, result }));
}

function sandboxWithRunner(run: (command: string) => ReturnType<typeof ok> | Promise<ReturnType<typeof ok>>): {
  calls: string[];
  sandbox: BrowserSessionSandbox;
} {
  const calls: string[] = [];

  return {
    calls,
    sandbox: {
      commands: {
        run: vi.fn(async (command: string) => {
          calls.push(command);
          return run(command);
        }),
      },
      sandboxId: "sandbox-browser-test",
    },
  };
}

describe("browserSession", () => {
  it("installs Browser-Use/Playwright and launches headed Chromium on the desktop display", async () => {
    const image = Buffer.from("png-bytes");
    const { calls, sandbox } = sandboxWithRunner((command) => {
      if (command.includes('payload = json.loads') && command.includes('/action')) {
        return actionResponse({
          screenshot: image.toString("base64"),
          screenshotByteCount: image.byteLength,
          title: "Hacker News",
          url: "https://news.ycombinator.com/",
        });
      }

      return ok();
    });

    const session = createBrowserSession({ logger: createLogger(), sandbox });
    const result = await session.navigate("https://news.ycombinator.com");

    expect(result.title).toBe("Hacker News");
    expect(result.screenshot.equals(image)).toBe(true);
    expect(calls[0]).toContain("browser-use playwright");
    expect(calls[0]).toContain("python3 -m playwright install chromium");
    expect(calls[2]).toContain("export DISPLAY=':0'");
    expect(calls[2]).toContain("HANDLE_BROWSER_VIEWPORT_WIDTH='1280'");
    expect(calls[2]).toContain("HANDLE_BROWSER_VIEWPORT_HEIGHT='800'");
  });

  it("retries idempotent actions once after a browser crash", async () => {
    const image = Buffer.from("retry-image");
    let actionCalls = 0;
    let installCalls = 0;
    let shutdownCalls = 0;
    const { sandbox } = sandboxWithRunner((command) => {
      if (command.includes("browser-use playwright")) {
        installCalls += 1;
        return ok();
      }
      if (command.includes("/shutdown")) {
        shutdownCalls += 1;
        return ok();
      }
      if (command.includes("/action")) {
        actionCalls += 1;
        if (actionCalls === 1) return fail();
        return actionResponse({
          screenshot: image.toString("base64"),
          screenshotByteCount: image.byteLength,
          title: "Recovered",
          url: "https://example.com/",
        });
      }

      return ok();
    });

    const session = createBrowserSession({ logger: createLogger(), sandbox });
    const result = await session.navigate("https://example.com");

    expect(result.title).toBe("Recovered");
    expect(actionCalls).toBe(2);
    expect(installCalls).toBe(2);
    expect(shutdownCalls).toBe(1);
  });

  it("does not retry side-effecting click actions after a crash", async () => {
    let actionCalls = 0;
    let shutdownCalls = 0;
    const { sandbox } = sandboxWithRunner((command) => {
      if (command.includes("/shutdown")) {
        shutdownCalls += 1;
        return ok();
      }
      if (command.includes("/action")) {
        actionCalls += 1;
        return fail();
      }

      return ok();
    });

    const session = createBrowserSession({ logger: createLogger(), sandbox });

    await expect(session.click(".titleline > a")).rejects.toThrow("Browser action click failed");
    expect(actionCalls).toBe(1);
    expect(shutdownCalls).toBe(0);
  });

  it("extracts page text and shuts down the session", async () => {
    let shutdownCalls = 0;
    const { sandbox } = sandboxWithRunner((command) => {
      if (command.includes("/shutdown")) {
        shutdownCalls += 1;
        return ok();
      }
      if (command.includes("/action")) {
        return actionResponse({
          text: "First HN Story",
          textLength: 14,
          title: "Hacker News",
          url: "https://news.ycombinator.com/",
        });
      }

      return ok();
    });

    const session = createBrowserSession({ logger: createLogger(), sandbox });

    await expect(session.extractText(".titleline > a")).resolves.toBe("First HN Story");
    await session.destroy();

    expect(shutdownCalls).toBe(1);
  });
});
