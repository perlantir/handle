import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });

const API_URL =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const API_PORT = new URL(API_URL).port || "3001";
const TIMEOUT_MS = Number.parseInt(
  process.env.HANDLE_COMPUTER_USE_AGENT_TIMEOUT_MS ?? "240000",
  10,
);
const GOAL =
  "Take a screenshot of the desktop and describe what you see in exactly 3 sentences.";
const providerOverride = process.argv
  .find((value) => value.startsWith("--provider="))
  ?.slice("--provider=".length);

const output = [];

function recordOutput(label, chunk) {
  const text = chunk.toString();
  output.push(`[${label}] ${text}`);
  if (output.join("").length > 20_000) output.splice(0, output.length - 40);
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
    HANDLE_TEST_AUTH_BYPASS: "1",
    NEXT_PUBLIC_HANDLE_API_BASE_URL: API_URL,
  };
}

function assertEnv(env) {
  const missing = ["E2B_API_KEY"].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Computer-use agent smoke requires ${missing.join(", ")} in root .env. Provider API keys are loaded through the Phase 2 Settings/Keychain path.`,
    );
  }
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

async function createTask() {
  const response = await fetch(`${API_URL}/api/tasks`, {
    body: JSON.stringify({
      goal: GOAL,
      ...(providerOverride ? { providerOverride } : {}),
    }),
    headers: {
      "content-type": "application/json",
      "x-handle-test-user-id": "user-smoke-computer-use-agent",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `/api/tasks returned ${response.status}: ${await response.text()}`,
    );
  }

  const payload = await response.json();
  if (!payload.taskId) throw new Error("Task response did not include taskId");
  return payload.taskId;
}

async function waitForTask(taskId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const events = [];
  let finalStatus = null;

  try {
    const response = await fetch(`${API_URL}/api/tasks/${taskId}/stream`, {
      headers: { "x-handle-test-user-id": "user-smoke-computer-use-agent" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `/api/tasks/${taskId}/stream returned ${response.status}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!finalStatus) {
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
      throw new Error(`Timed out waiting for task ${taskId}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return { events, finalStatus };
}

function assertResult(taskId, events, finalStatus) {
  if (finalStatus !== "STOPPED") {
    const errors = events
      .filter((event) => event.type === "error")
      .map((event) => event.message)
      .join(" | ");
    throw new Error(
      `Task ${taskId} ended ${finalStatus}, expected STOPPED. ${errors}`,
    );
  }

  const sawComputerUse = events.some(
    (event) => event.type === "tool_call" && event.toolName === "computer.use",
  );
  if (!sawComputerUse) {
    throw new Error(`Task ${taskId} did not call computer_use`);
  }

  const screenshots = events.filter(
    (event) =>
      event.type === "browser_screenshot" && event.source === "computer_use",
  );
  if (screenshots.length < 1) {
    throw new Error(`Task ${taskId} did not emit a computer_use screenshot`);
  }

  const message = events
    .filter(
      (event) => event.type === "message" && typeof event.content === "string",
    )
    .map((event) => event.content)
    .at(-1);
  if (!message) throw new Error(`Task ${taskId} did not emit a final message`);

  const sentenceCount = message
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
  const lower = message.toLowerCase();
  const hasVisualKeyword = [
    "desktop",
    "screen",
    "panel",
    "empty",
    "blank",
  ].some((keyword) => lower.includes(keyword));

  if (sentenceCount !== 3 || !hasVisualKeyword) {
    throw new Error(
      `Task ${taskId} final message did not look like a 3-sentence desktop description: ${message}`,
    );
  }

  console.log(
    `[smoke:computer-use-agent] PASS task ${taskId}; provider=${providerOverride ?? "active"}; screenshots=${screenshots.length}; events=${events.length}`,
  );
  console.log(`[smoke:computer-use-agent] final response: ${message}`);
}

let api;

try {
  const env = smokeEnv();
  assertEnv(env);

  await assertPortFree(`${API_URL}/health`, "API port");
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

  const taskId = await createTask();
  const { events, finalStatus } = await waitForTask(taskId);
  assertResult(taskId, events, finalStatus);
} catch (error) {
  console.error(
    `[smoke:computer-use-agent] ${error instanceof Error ? error.message : "failed"}`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  stopServer(api);
}
