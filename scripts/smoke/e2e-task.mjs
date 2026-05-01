import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = new URL("../..", import.meta.url);
const WEB_URL =
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const API_URL =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const TIMEOUT_MS = 60_000;
const API_PORT = new URL(API_URL).port || "3001";
const PROXY_LOOP_TEXT = "Failed to proxy http://localhost:3000";

const output = [];
let sawProxyLoop = false;

function recordOutput(label, chunk) {
  const text = chunk.toString();
  output.push(`[${label}] ${text}`);
  if (output.join("").length > 20_000) {
    output.splice(0, output.length - 40);
  }
  if (text.includes(PROXY_LOOP_TEXT)) {
    sawProxyLoop = true;
  }
}

function outputTail() {
  return output.join("").slice(-8_000);
}

function smokeEnv() {
  return {
    ...process.env,
    HANDLE_API_BASE_URL: API_URL,
    HANDLE_API_HOST: "127.0.0.1",
    HANDLE_API_PORT: API_PORT,
    HANDLE_SMOKE_AGENT: "1",
    HANDLE_TEST_AUTH_BYPASS: "1",
    NEXT_PUBLIC_HANDLE_API_BASE_URL: API_URL,
    NEXT_PUBLIC_HANDLE_TEST_AUTH_BYPASS: "1",
    NEXT_PUBLIC_HANDLE_WEB_BASE_URL: WEB_URL,
  };
}

function runChecked(label, args, env) {
  const result = spawnSync("pnpm", args, {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });

  if (result.stdout) recordOutput(label, result.stdout);
  if (result.stderr) recordOutput(label, result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

function spawnServer(label, args, env) {
  const child = spawn("pnpm", args, {
    cwd: ROOT,
    detached: process.platform !== "win32",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => recordOutput(label, chunk));
  child.stderr.on("data", (chunk) => recordOutput(label, chunk));
  child.on("exit", (code, signal) => {
    recordOutput(
      label,
      `exited code=${code ?? "null"} signal=${signal ?? "null"}\n`,
    );
  });

  return child;
}

function stopServer(child) {
  if (!child || child.killed) return;

  if (process.platform === "win32") {
    child.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function assertPortFree(url, label) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(700) });
    throw new Error(
      `${label} already responded with ${response.status}; stop the existing dev server first`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("already responded")) {
      throw error;
    }
  }
}

async function waitForServer(url, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (sawProxyLoop) {
      throw new Error(`Next dev server printed ${PROXY_LOOP_TEXT}`);
    }

    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function waitForTaskEvents(taskId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const events = [];
  let sawToolCall = false;
  let finalStatus = null;

  try {
    const response = await fetch(`${WEB_URL}/api/stream/${taskId}`, {
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`/api/stream/${taskId} returned ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!finalStatus || !sawToolCall) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");

      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const data = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (data) {
          const event = JSON.parse(data);
          events.push(event);
          if (event.type === "tool_call") sawToolCall = true;
          if (
            event.type === "status_update" &&
            ["STOPPED", "ERROR"].includes(event.status)
          ) {
            finalStatus = event.status;
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    }

    await reader.cancel().catch(() => {});
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out waiting for task ${taskId} SSE events`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!sawToolCall) {
    throw new Error(`Task ${taskId} did not emit a tool_call event`);
  }
  if (!finalStatus) {
    throw new Error(
      `Task ${taskId} did not emit a terminal status_update event`,
    );
  }

  return { events, finalStatus };
}

let api;
let web;
let browser;

try {
  const env = smokeEnv();

  await assertPortFree(`${API_URL}/health`, "API port");
  await assertPortFree(`${WEB_URL}/sign-in`, "Web port");

  runChecked(
    "prisma-generate",
    ["--filter", "@handle/api", "prisma", "generate"],
    env,
  );
  runChecked(
    "prisma-migrate",
    ["--filter", "@handle/api", "prisma", "migrate", "deploy"],
    env,
  );

  api = spawnServer(
    "api",
    [
      "--filter",
      "@handle/api",
      "exec",
      "dotenv",
      "-e",
      "../../.env",
      "--",
      "tsx",
      "src/index.ts",
    ],
    env,
  );
  await waitForServer(`${API_URL}/health`, "API");

  web = spawnServer(
    "web",
    [
      "--filter",
      "@handle/web",
      "exec",
      "dotenv",
      "-e",
      "../../.env",
      "--",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    env,
  );
  await waitForServer(`${WEB_URL}/sign-in`, "web");

  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${WEB_URL}/sign-in`);
  await page.getByText("Continue as smoke user").click();
  await page.waitForURL(`${WEB_URL}/`);
  await page
    .locator('textarea[name="goal"]')
    .fill("Smoke e2e task: emit one tool call and finish.");
  const taskResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${API_URL}/api/tasks` &&
      response.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();

  const taskResponse = await taskResponsePromise;
  if (!taskResponse.ok()) {
    throw new Error(`/api/tasks returned ${taskResponse.status()}`);
  }

  const { taskId } = await taskResponse.json();
  if (!taskId) throw new Error("Could not read task id from workspace URL");

  const taskEventsPromise = waitForTaskEvents(taskId);
  await page.waitForURL(`${WEB_URL}/tasks/${taskId}`);

  const { events, finalStatus } = await taskEventsPromise;

  if (pageErrors.length > 0) {
    throw new Error(`Browser errors were reported: ${pageErrors.join(" | ")}`);
  }

  console.log(
    `[smoke:e2e-task] task ${taskId} emitted ${events.length} SSE events including tool_call and ${finalStatus}`,
  );
} catch (error) {
  console.error(
    `[smoke:e2e-task] ${error instanceof Error ? error.message : "failed"}`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(web);
  stopServer(api);
}
