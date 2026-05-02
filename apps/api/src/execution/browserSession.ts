import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Sandbox as E2BDesktopSandbox } from "@e2b/desktop";
import { logger } from "../lib/logger";
import { redactSecrets } from "../lib/redact";

export interface BrowserSessionSandbox {
  sandboxId?: string;
  commands: {
    run(
      command: string,
      options?: {
        onStderr?: (data: string) => void | Promise<void>;
        onStdout?: (data: string) => void | Promise<void>;
      },
    ): Promise<{
      error?: string;
      exitCode?: number;
      stderr?: string;
      stdout?: string;
    }>;
  };
  files?: {
    write(path: string, data: string): Promise<unknown>;
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
const NODE_RUNTIME_PATH = "/tmp/handle-browser-runtime";
const NODE_INSTALL_PATH = `${NODE_RUNTIME_PATH}/node`;
const NODE_BIN_PATH = `${NODE_INSTALL_PATH}/bin`;
const NODE_BINARY = `${NODE_BIN_PATH}/node`;
const NPM_BINARY = `${NODE_BIN_PATH}/npm`;
const NPX_BINARY = `${NODE_BIN_PATH}/npx`;
const SERVER_PATH = `${NODE_RUNTIME_PATH}/handle-browser-server.mjs`;
const SERVER_LOG_PATH = "/tmp/handle-browser-server.log";
const SERVER_PROFILE_PATH = "/tmp/handle-browser-profile";
const ACTION_TIMEOUT_MS = 30_000;

const BROWSER_SERVER_SCRIPT = String.raw`
import { createServer } from "node:http";
import { chromium } from "playwright";

const PORT = Number.parseInt(process.env.HANDLE_BROWSER_PORT ?? "41231", 10);
const PROFILE = process.env.HANDLE_BROWSER_PROFILE ?? "/tmp/handle-browser-profile";
const WIDTH = Number.parseInt(process.env.HANDLE_BROWSER_VIEWPORT_WIDTH ?? "1280", 10);
const HEIGHT = Number.parseInt(process.env.HANDLE_BROWSER_VIEWPORT_HEIGHT ?? "800", 10);
const USER_AGENT = process.env.HANDLE_BROWSER_USER_AGENT || undefined;

const context = await chromium.launchPersistentContext(PROFILE, {
  args: [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--window-size=" + WIDTH + "," + HEIGHT,
  ],
  headless: false,
  userAgent: USER_AGENT,
  viewport: { width: WIDTH, height: HEIGHT },
});
const page = context.pages()[0] ?? await context.newPage();

function selectorTimeout(args) {
  return args.timeoutMs === undefined || args.timeoutMs === null ? 30000 : Number(args.timeoutMs);
}

async function screenshotB64() {
  const image = await page.screenshot({ type: "png" });
  return { image: image.toString("base64"), byteCount: image.byteLength };
}

async function pageState(includeScreenshot = false) {
  const result = {
    title: await page.title(),
    url: page.url(),
  };

  if (includeScreenshot) {
    const screenshot = await screenshotB64();
    result.screenshot = screenshot.image;
    result.screenshotByteCount = screenshot.byteCount;
  }

  return result;
}

async function handleAction(payload) {
  const action = payload.action;
  const args = payload.args ?? {};

  if (action === "navigate") {
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: selectorTimeout(args) });
    return pageState(true);
  }

  if (action === "click") {
    await page.locator(args.selector).first().click({ timeout: selectorTimeout(args) });
    return pageState(Boolean(args.includeScreenshot));
  }

  if (action === "type") {
    const locator = page.locator(args.selector).first();
    await locator.click({ timeout: selectorTimeout(args) });
    await page.keyboard.type(args.text ?? "");
    return pageState(Boolean(args.includeScreenshot));
  }

  if (action === "extractText") {
    const selector = args.selector ?? "body";
    const text = await page.locator(selector).first().innerText({ timeout: selectorTimeout(args) });
    return { text, textLength: text.length, ...(await pageState(false)) };
  }

  if (action === "screenshot") {
    const screenshot = await screenshotB64();
    return { screenshot: screenshot.image, screenshotByteCount: screenshot.byteCount, ...(await pageState(false)) };
  }

  if (action === "goBack") {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: selectorTimeout(args) });
    return pageState(Boolean(args.includeScreenshot));
  }

  if (action === "scroll") {
    const amount = Number(args.amount ?? 600);
    const delta = args.direction === "up" ? -amount : amount;
    await page.mouse.wheel(0, delta);
    return pageState(Boolean(args.includeScreenshot));
  }

  if (action === "waitForSelector") {
    await page.locator(args.selector).first().waitFor({ timeout: selectorTimeout(args) });
    return pageState(Boolean(args.includeScreenshot));
  }

  throw new Error("Unsupported browser action: " + action);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data || "{}"));
    req.on("error", reject);
  });
}

async function shutdown() {
  try {
    await context.close();
  } finally {
    server.close(() => process.exit(0));
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, ...(await pageState(false)) });
    return;
  }

  if (req.method === "POST" && req.url === "/shutdown") {
    json(res, 200, { ok: true });
    setImmediate(() => void shutdown());
    return;
  }

  if (req.method !== "POST" || req.url !== "/action") {
    json(res, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const payload = JSON.parse(await readBody(req));
    json(res, 200, { ok: true, result: await handleAction(payload) });
  } catch (err) {
    json(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ event: "handle_browser_server_started", port: PORT }));
});

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
`;

function durationSince(startedAt: number) {
  return Date.now() - startedAt;
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function jsStringLiteral(value: string) {
  return JSON.stringify(value);
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

    const command = [
      "set -eu",
      "echo \"Browser runtime PATH=$PATH\"",
      `mkdir -p ${shellSingleQuote(NODE_RUNTIME_PATH)}`,
      `cd ${shellSingleQuote(NODE_RUNTIME_PATH)}`,
      `if [ ! -x ${shellSingleQuote(NODE_BINARY)} ]; then`,
      "  echo \"Node.js runtime missing; installing Node.js 20 tarball under /tmp\"",
      "  NODE_DIST_URL=https://nodejs.org/dist/latest-v20.x",
      "  NODE_TARBALL=$(curl -fsSL \"$NODE_DIST_URL/SHASUMS256.txt\" | awk '/linux-x64.tar.xz$/ { print $2; exit }')",
      "  if [ -z \"$NODE_TARBALL\" ]; then echo \"Could not resolve Node.js linux-x64 tarball\" >&2; exit 1; fi",
      "  curl -fsSL \"$NODE_DIST_URL/$NODE_TARBALL\" -o node.tar.xz",
      "  rm -rf node node-download",
      "  mkdir -p node-download",
      "  tar -xJf node.tar.xz -C node-download --strip-components=1",
      "  mv node-download node",
      "fi",
      `export PATH=${shellSingleQuote(NODE_BIN_PATH)}:$PATH`,
      `${shellSingleQuote(NODE_BINARY)} --version`,
      `${shellSingleQuote(NPM_BINARY)} --version`,
      "[ -f package.json ] || npm init -y >/dev/null 2>&1",
      `${shellSingleQuote(NPM_BINARY)} install --no-audit --no-fund playwright`,
      `${shellSingleQuote(NPX_BINARY)} playwright install chromium`,
    ].join("\n");

    this.options.logger.info(
      { command: redactSecrets(command), sandboxId: this.sandboxId },
      "Browser runtime install command",
    );

    const result = await this.options.sandbox.commands.run(command, {
      onStderr: (data) => {
        this.options.logger.info(
          { sandboxId: this.sandboxId, stderr: redactSecrets(data) },
          "Browser runtime install stderr",
        );
      },
      onStdout: (data) => {
        this.options.logger.info(
          { sandboxId: this.sandboxId, stdout: redactSecrets(data) },
          "Browser runtime install stdout",
        );
      },
    });

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage("Browser runtime install", result));
    }

    this.options.logger.info(
      {
        durationMs: durationSince(startedAt),
        runtimePath: NODE_RUNTIME_PATH,
        sandboxId: this.sandboxId,
      },
      "Browser runtime install complete",
    );
  }

  private async writeServerScript() {
    const startedAt = Date.now();

    if (this.options.sandbox.files?.write) {
      await this.options.sandbox.files.write(SERVER_PATH, BROWSER_SERVER_SCRIPT);
      this.options.logger.info(
        {
          byteCount: Buffer.byteLength(BROWSER_SERVER_SCRIPT),
          durationMs: durationSince(startedAt),
          path: SERVER_PATH,
          sandboxId: this.sandboxId,
        },
        "Browser server script written via filesystem API",
      );
      return;
    }

    this.options.logger.warn?.(
      { path: SERVER_PATH, sandboxId: this.sandboxId },
      "Browser server script filesystem API unavailable; falling back to Python writer",
    );

    const encoded = Buffer.from(BROWSER_SERVER_SCRIPT, "utf8").toString("base64");
    const command = [
      "python3 - <<'PY'",
      "import base64",
      "from pathlib import Path",
      `Path(${jsStringLiteral(SERVER_PATH)}).write_bytes(base64.b64decode(${jsStringLiteral(encoded)}))`,
      "PY",
    ].join("\n");
    const result = await this.options.sandbox.commands.run(command);

    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw new Error(commandFailureMessage("Browser server script write", result));
    }

    this.options.logger.info(
      {
        byteCount: Buffer.byteLength(BROWSER_SERVER_SCRIPT),
        durationMs: durationSince(startedAt),
        path: SERVER_PATH,
        sandboxId: this.sandboxId,
      },
      "Browser server script written via Python fallback",
    );
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
      `cd ${shellSingleQuote(NODE_RUNTIME_PATH)}`,
      `nohup ${shellSingleQuote(NODE_BINARY)} ${shellSingleQuote(SERVER_PATH)} > ${shellSingleQuote(SERVER_LOG_PATH)} 2>&1 &`,
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
    const body = `curl -fsS --max-time 2 ${shellSingleQuote(`http://127.0.0.1:${this.options.port}/health`)}`;
    if (!allowFailure) return body;

    return [
      `  if ${body}; then`,
      "    exit 0",
      "  fi",
    ].join("\n");
  }

  private httpCommand(path: "/action" | "/health" | "/shutdown", payload: unknown) {
    const timeout = Math.ceil(ACTION_TIMEOUT_MS / 1000);
    return [
      `${shellSingleQuote(NODE_BINARY)} --input-type=module - <<'NODE'`,
      `const payload = JSON.parse(${jsStringLiteral(JSON.stringify(payload))});`,
      `const path = ${jsStringLiteral(path)};`,
      `const port = ${this.options.port};`,
      `const timeoutMs = ${timeout * 1000};`,
      "const body = JSON.stringify(payload);",
      "const controller = new AbortController();",
      "const timeout = setTimeout(() => controller.abort(), timeoutMs);",
      "let exitCode = 1;",
      "try {",
      "  const response = await fetch('http://127.0.0.1:' + port + path, {",
      "    body: path === '/health' ? undefined : body,",
      "    headers: { 'Content-Type': 'application/json' },",
      "    method: path === '/health' ? 'GET' : 'POST',",
      "    signal: controller.signal,",
      "  });",
      "  const text = await response.text();",
      "  console.log(text);",
      "  exitCode = response.status < 400 ? 0 : 1;",
      "} catch (err) {",
      "  console.error(err instanceof Error ? err.stack || err.message : String(err));",
      "  exitCode = 1;",
      "} finally {",
      "  clearTimeout(timeout);",
      "}",
      "process.exit(exitCode);",
      "NODE",
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
