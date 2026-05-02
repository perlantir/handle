import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Sandbox as E2BDesktopSandbox } from "@e2b/desktop";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";

export interface BrowserSessionSandbox {
  sandboxId?: string;
  commands: {
    run(command: string): Promise<{
      error?: string;
      exitCode?: number;
      stderr?: string;
      stdout?: string;
    }>;
  };
}

export interface BrowserSessionSandboxHandle extends BrowserSessionSandbox {
  kill(): Promise<void>;
}

export interface BrowserSessionLogger {
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn?(payload: Record<string, unknown>, message: string): void;
}

export interface BrowserSessionCreateOptions {
  display?: string;
  logger?: BrowserSessionLogger;
  port?: number;
  sandbox: BrowserSessionSandbox;
  userAgent?: string;
  viewport?: { height: number; width: number };
}

export interface BrowserDesktopSandboxCreateOptions {
  resolution?: [number, number];
  timeoutMs?: number;
}

export interface BrowserNavigateResult {
  screenshot: Buffer;
  title: string;
  url: string;
}

export interface BrowserActionResult {
  screenshot?: Buffer;
  title: string;
  url: string;
}

export interface BrowserSession {
  click(selector: string, options?: BrowserSelectorOptions): Promise<BrowserActionResult>;
  destroy(): Promise<void>;
  extractText(selector?: string): Promise<string>;
  goBack(options?: BrowserTimeoutOptions): Promise<BrowserActionResult>;
  navigate(url: string, options?: BrowserTimeoutOptions): Promise<BrowserNavigateResult>;
  screenshot(): Promise<Buffer>;
  scroll(direction: "up" | "down", amount?: number): Promise<BrowserActionResult>;
  type(selector: string, text: string, options?: BrowserSelectorOptions): Promise<BrowserActionResult>;
  waitForSelector(selector: string, options?: BrowserSelectorOptions): Promise<BrowserActionResult>;
}

export interface BrowserSelectorOptions extends BrowserTimeoutOptions {
  includeScreenshot?: boolean;
}

export interface BrowserTimeoutOptions {
  timeoutMs?: number;
}

interface BrowserServerResponse {
  error?: string;
  ok: boolean;
  result?: Record<string, unknown>;
}

const DEFAULT_PORT = 41231;
const DEFAULT_VIEWPORT = { height: 800, width: 1280 };
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_DISPLAY = ":0";
const SERVER_PATH = "/tmp/handle-browser-server.py";
const SERVER_LOG_PATH = "/tmp/handle-browser-server.log";
const SERVER_PROFILE_PATH = "/tmp/handle-browser-profile";
const ACTION_TIMEOUT_MS = 30_000;

const BROWSER_SERVER_SCRIPT = String.raw`
import base64
import json
import os
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

PORT = int(os.environ.get("HANDLE_BROWSER_PORT", "41231"))
PROFILE = os.environ.get("HANDLE_BROWSER_PROFILE", "/tmp/handle-browser-profile")
WIDTH = int(os.environ.get("HANDLE_BROWSER_VIEWPORT_WIDTH", "1280"))
HEIGHT = int(os.environ.get("HANDLE_BROWSER_VIEWPORT_HEIGHT", "800"))
USER_AGENT = os.environ.get("HANDLE_BROWSER_USER_AGENT")

playwright = sync_playwright().start()
context = playwright.chromium.launch_persistent_context(
    PROFILE,
    args=[
        "--disable-dev-shm-usage",
        "--no-sandbox",
        f"--window-size={WIDTH},{HEIGHT}",
    ],
    headless=False,
    user_agent=USER_AGENT,
    viewport={"width": WIDTH, "height": HEIGHT},
)
page = context.pages[0] if context.pages else context.new_page()

def screenshot_b64():
    image = page.screenshot(type="png")
    return base64.b64encode(image).decode("ascii"), len(image)

def page_state(include_screenshot=False):
    result = {
        "title": page.title(),
        "url": page.url,
    }
    if include_screenshot:
        image, byte_count = screenshot_b64()
        result["screenshot"] = image
        result["screenshotByteCount"] = byte_count
    return result

def selector_timeout(args):
    timeout = args.get("timeoutMs")
    return int(timeout) if timeout is not None else 30000

def handle_action(payload):
    action = payload.get("action")
    args = payload.get("args") or {}

    if action == "navigate":
        page.goto(args["url"], wait_until="domcontentloaded", timeout=selector_timeout(args))
        return page_state(include_screenshot=True)

    if action == "click":
        selector = args["selector"]
        page.locator(selector).first.click(timeout=selector_timeout(args))
        return page_state(include_screenshot=bool(args.get("includeScreenshot")))

    if action == "type":
        selector = args["selector"]
        text = args.get("text", "")
        locator = page.locator(selector).first
        locator.click(timeout=selector_timeout(args))
        page.keyboard.type(text)
        return page_state(include_screenshot=bool(args.get("includeScreenshot")))

    if action == "extractText":
        selector = args.get("selector")
        if selector:
            text = page.locator(selector).first.inner_text(timeout=selector_timeout(args))
        else:
            text = page.locator("body").inner_text(timeout=selector_timeout(args))
        return {"text": text, "textLength": len(text), **page_state(False)}

    if action == "screenshot":
        image, byte_count = screenshot_b64()
        return {"screenshot": image, "screenshotByteCount": byte_count, **page_state(False)}

    if action == "goBack":
        page.go_back(wait_until="domcontentloaded", timeout=selector_timeout(args))
        return page_state(include_screenshot=bool(args.get("includeScreenshot")))

    if action == "scroll":
        direction = args.get("direction", "down")
        amount = int(args.get("amount") or 600)
        delta = -amount if direction == "up" else amount
        page.mouse.wheel(0, delta)
        return page_state(include_screenshot=bool(args.get("includeScreenshot")))

    if action == "waitForSelector":
        page.locator(args["selector"]).first.wait_for(timeout=selector_timeout(args))
        return page_state(include_screenshot=bool(args.get("includeScreenshot")))

    raise ValueError(f"Unsupported browser action: {action}")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, **page_state(False)})
            return
        self._json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length else b"{}"

        if self.path == "/shutdown":
            self._json(200, {"ok": True})
            threading.Thread(target=shutdown_server, daemon=True).start()
            return

        if self.path != "/action":
            self._json(404, {"ok": False, "error": "Not found"})
            return

        try:
            payload = json.loads(raw.decode("utf-8"))
            self._json(200, {"ok": True, "result": handle_action(payload)})
        except Exception as exc:
            self._json(
                500,
                {
                    "ok": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                },
            )

def shutdown_server():
    try:
        context.close()
    finally:
        playwright.stop()
        server.shutdown()

server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print(json.dumps({"event": "handle_browser_server_started", "port": PORT}), flush=True)
try:
    server.serve_forever()
finally:
    try:
        context.close()
    except Exception:
        pass
    try:
        playwright.stop()
    except Exception:
        pass
`;

function durationSince(startedAt: number) {
  return Date.now() - startedAt;
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function pythonJsonLiteral(value: unknown) {
  return JSON.stringify(JSON.stringify(value));
}

function parseServerResponse(stdout: string): BrowserServerResponse {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Browser server returned empty response");
  }

  try {
    return JSON.parse(trimmed) as BrowserServerResponse;
  } catch (err) {
    throw new Error(
      `Browser server returned invalid JSON: ${redactSecrets(trimmed.slice(0, 1_000))}`,
      { cause: err },
    );
  }
}

function imageFromResult(result: Record<string, unknown>, field = "screenshot") {
  const value = result[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Browser action result missing ${field}`);
  }

  return Buffer.from(value, "base64");
}

function stringFromResult(result: Record<string, unknown>, field: string) {
  const value = result[field];
  return typeof value === "string" ? value : "";
}

function commandFailureMessage(label: string, result: { error?: string; stderr?: string; stdout?: string }) {
  const body = result.stderr || result.stdout || result.error || "unknown error";
  return `${label} failed: ${redactSecrets(body)}`;
}

export class E2BBrowserSession implements BrowserSession {
  private destroyed = false;
  private ready = false;

  readonly sandboxId: string;

  constructor(
    private readonly options: Required<
      Pick<BrowserSessionCreateOptions, "display" | "logger" | "port" | "sandbox" | "userAgent" | "viewport">
    >,
  ) {
    this.sandboxId = options.sandbox.sandboxId ?? "unknown";
  }

  async navigate(url: string, options: BrowserTimeoutOptions = {}) {
    const result = await this.runAction(
      "navigate",
      { timeoutMs: options.timeoutMs, url },
      { idempotent: true, target: url },
    );

    return {
      screenshot: imageFromResult(result),
      title: stringFromResult(result, "title"),
      url: stringFromResult(result, "url"),
    };
  }

  async click(selector: string, options: BrowserSelectorOptions = {}) {
    const result = await this.runAction(
      "click",
      {
        includeScreenshot: options.includeScreenshot,
        selector,
        timeoutMs: options.timeoutMs,
      },
      { idempotent: false, target: selector },
    );
    return this.actionResult(result);
  }

  async type(selector: string, text: string, options: BrowserSelectorOptions = {}) {
    const result = await this.runAction(
      "type",
      {
        includeScreenshot: options.includeScreenshot,
        selector,
        text,
        timeoutMs: options.timeoutMs,
      },
      { idempotent: false, target: selector },
    );
    return this.actionResult(result);
  }

  async extractText(selector?: string) {
    const result = await this.runAction(
      "extractText",
      { selector },
      { idempotent: true, target: selector ?? "body" },
    );
    return stringFromResult(result, "text");
  }

  async screenshot() {
    const result = await this.runAction(
      "screenshot",
      {},
      { idempotent: true, target: "viewport" },
    );
    return imageFromResult(result);
  }

  async goBack(options: BrowserTimeoutOptions = {}) {
    const result = await this.runAction(
      "goBack",
      { timeoutMs: options.timeoutMs },
      { idempotent: true, target: "history" },
    );
    return this.actionResult(result);
  }

  async scroll(direction: "up" | "down", amount = 600) {
    const result = await this.runAction(
      "scroll",
      { amount, direction },
      { idempotent: true, target: direction },
    );
    return this.actionResult(result);
  }

  async waitForSelector(selector: string, options: BrowserSelectorOptions = {}) {
    const result = await this.runAction(
      "waitForSelector",
      {
        includeScreenshot: options.includeScreenshot,
        selector,
        timeoutMs: options.timeoutMs,
      },
      { idempotent: true, target: selector },
    );
    return this.actionResult(result);
  }

  async destroy() {
    if (this.destroyed) return;

    const startedAt = Date.now();
    this.options.logger.info(
      { sandboxId: this.sandboxId },
      "Browser session destroy started",
    );

    this.destroyed = true;
    if (!this.ready) {
      this.options.logger.info(
        { durationMs: durationSince(startedAt), sandboxId: this.sandboxId },
        "Browser session destroy skipped because server was not ready",
      );
      return;
    }

    const command = this.httpCommand("/shutdown", {});
    const result = await this.options.sandbox.commands.run(command);

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      this.options.logger.error(
        {
          durationMs: durationSince(startedAt),
          exitCode: result.exitCode,
          sandboxId: this.sandboxId,
          stderr: redactSecrets(result.stderr ?? ""),
          stdout: redactSecrets(result.stdout ?? ""),
        },
        "Browser session destroy failed",
      );
      return;
    }

    this.options.logger.info(
      { durationMs: durationSince(startedAt), sandboxId: this.sandboxId },
      "Browser session destroy complete",
    );
  }

  private actionResult(result: Record<string, unknown>): BrowserActionResult {
    const screenshot = typeof result.screenshot === "string" && result.screenshot
      ? Buffer.from(result.screenshot, "base64")
      : undefined;
    return {
      ...(screenshot ? { screenshot } : {}),
      title: stringFromResult(result, "title"),
      url: stringFromResult(result, "url"),
    };
  }

  private async runAction(
    action: string,
    args: Record<string, unknown>,
    options: { idempotent: boolean; target: string },
  ) {
    const startedAt = Date.now();
    this.options.logger.info(
      {
        action,
        sandboxId: this.sandboxId,
        target: options.target,
      },
      "Browser action started",
    );

    try {
      const result = await this.invokeAction(action, args);
      this.logActionComplete(action, options.target, startedAt, result);
      return result;
    } catch (err) {
      this.options.logger.error(
        {
          action,
          durationMs: durationSince(startedAt),
          err,
          idempotent: options.idempotent,
          sandboxId: this.sandboxId,
          target: options.target,
        },
        "Browser action failed",
      );

      if (!options.idempotent) throw err;

      this.options.logger.warn?.(
        {
          action,
          sandboxId: this.sandboxId,
          target: options.target,
        },
        "Retrying idempotent browser action after browser session restart",
      );
      await this.restart();
      const result = await this.invokeAction(action, args);
      this.logActionComplete(action, options.target, startedAt, result, true);
      return result;
    }
  }

  private async invokeAction(action: string, args: Record<string, unknown>) {
    await this.ensureReady();
    const command = this.httpCommand("/action", { action, args });
    const result = await this.options.sandbox.commands.run(command);

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage(`Browser action ${action}`, result));
    }

    const parsed = parseServerResponse(result.stdout ?? "");
    if (!parsed.ok) {
      throw new Error(redactSecrets(parsed.error ?? `Browser action ${action} failed`));
    }

    return parsed.result ?? {};
  }

  private async ensureReady() {
    if (this.destroyed) {
      throw new Error("Browser session has already been destroyed");
    }
    if (this.ready) return;

    const startedAt = Date.now();
    this.options.logger.info(
      {
        display: this.options.display,
        port: this.options.port,
        sandboxId: this.sandboxId,
        viewport: this.options.viewport,
      },
      "Browser session creation started",
    );

    await this.installBrowserRuntime();
    await this.writeServerScript();
    await this.startServer();
    this.ready = true;

    this.options.logger.info(
      {
        display: this.options.display,
        durationMs: durationSince(startedAt),
        port: this.options.port,
        sandboxId: this.sandboxId,
      },
      "Browser session creation complete",
    );
  }

  private async installBrowserRuntime() {
    const startedAt = Date.now();
    this.options.logger.info(
      { sandboxId: this.sandboxId },
      "Browser runtime install started",
    );

    const result = await this.options.sandbox.commands.run(
      [
        "python3 -m pip install --quiet --disable-pip-version-check browser-use playwright",
        "python3 -m playwright install chromium",
      ].join(" && "),
    );

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage("Browser runtime install", result));
    }

    this.options.logger.info(
      { durationMs: durationSince(startedAt), sandboxId: this.sandboxId },
      "Browser runtime install complete",
    );
  }

  private async writeServerScript() {
    const encoded = Buffer.from(BROWSER_SERVER_SCRIPT, "utf8").toString("base64");
    const command = [
      "python3 - <<'PY'",
      "import base64",
      "from pathlib import Path",
      `Path(${pythonJsonLiteral(SERVER_PATH)}).write_bytes(base64.b64decode(${pythonJsonLiteral(encoded)}))`,
      "PY",
    ].join("\n");
    const result = await this.options.sandbox.commands.run(command);

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage("Browser server script write", result));
    }
  }

  private async startServer() {
    const { height, width } = this.options.viewport;
    const command = [
      "set -eu",
      `export DISPLAY=${shellSingleQuote(this.options.display)}`,
      `export HANDLE_BROWSER_PORT=${shellSingleQuote(String(this.options.port))}`,
      `export HANDLE_BROWSER_PROFILE=${shellSingleQuote(SERVER_PROFILE_PATH)}`,
      `export HANDLE_BROWSER_VIEWPORT_WIDTH=${shellSingleQuote(String(width))}`,
      `export HANDLE_BROWSER_VIEWPORT_HEIGHT=${shellSingleQuote(String(height))}`,
      `export HANDLE_BROWSER_USER_AGENT=${shellSingleQuote(this.options.userAgent)}`,
      `nohup python3 ${shellSingleQuote(SERVER_PATH)} > ${shellSingleQuote(SERVER_LOG_PATH)} 2>&1 &`,
      "for i in $(seq 1 100); do",
      this.healthCheckCommand({ allowFailure: true }),
      "  sleep 0.2",
      "done",
      `echo "Browser server failed to start" >&2`,
      `tail -100 ${shellSingleQuote(SERVER_LOG_PATH)} >&2 || true`,
      "exit 1",
    ].join("\n");
    const result = await this.options.sandbox.commands.run(command);

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage("Browser server start", result));
    }
  }

  private async restart() {
    const wasReady = this.ready;
    this.destroyed = false;
    if (wasReady) {
      await this.destroy().catch(() => undefined);
    }
    this.destroyed = false;
    this.ready = false;
    await this.ensureReady();
  }

  private healthCheckCommand({ allowFailure }: { allowFailure: boolean }) {
    const body = this.httpCommand("/health", {});
    if (!allowFailure) return body;

    return [
      "  set +e",
      body,
      "  status=$?",
      "  set -e",
      "  if [ \"$status\" -eq 0 ]; then exit 0; fi",
      "  true",
    ].join("\n");
  }

  private httpCommand(path: "/action" | "/health" | "/shutdown", payload: unknown) {
    const timeout = Math.ceil(ACTION_TIMEOUT_MS / 1000);
    return [
      "python3 - <<'PY'",
      "import http.client",
      "import json",
      "import sys",
      `payload = json.loads(${pythonJsonLiteral(JSON.stringify(payload))})`,
      `conn = http.client.HTTPConnection("127.0.0.1", ${this.options.port}, timeout=${timeout})`,
      `conn.request("POST" if ${pythonJsonLiteral(path)} != "/health" else "GET", ${pythonJsonLiteral(path)}, body=json.dumps(payload), headers={"Content-Type": "application/json"})`,
      "resp = conn.getresponse()",
      "body = resp.read().decode('utf-8', errors='replace')",
      "print(body)",
      "sys.exit(0 if resp.status < 400 else 1)",
      "PY",
    ].join("\n");
  }

  private logActionComplete(
    action: string,
    target: string,
    startedAt: number,
    result: Record<string, unknown>,
    retried = false,
  ) {
    const text = typeof result.text === "string" ? result.text : "";
    const screenshot =
      typeof result.screenshot === "string" ? Buffer.byteLength(result.screenshot, "base64") : 0;
    const reportedScreenshotByteCount =
      typeof result.screenshotByteCount === "number" ? result.screenshotByteCount : screenshot;

    this.options.logger.info(
      {
        action,
        durationMs: durationSince(startedAt),
        retried,
        sandboxId: this.sandboxId,
        screenshotByteCount: reportedScreenshotByteCount,
        target,
        textByteCount: Buffer.byteLength(text),
      },
      "Browser action complete",
    );
  }
}

export function createBrowserSession(options: BrowserSessionCreateOptions): BrowserSession {
  return new E2BBrowserSession({
    display: options.display ?? DEFAULT_DISPLAY,
    logger: options.logger ?? logger,
    port: options.port ?? DEFAULT_PORT,
    sandbox: options.sandbox,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    viewport: options.viewport ?? DEFAULT_VIEWPORT,
  });
}

export async function createBrowserDesktopSandbox(
  options: BrowserDesktopSandboxCreateOptions = {},
): Promise<BrowserSessionSandboxHandle> {
  return E2BDesktopSandbox.create(options);
}
