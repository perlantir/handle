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
  process.env.HANDLE_MESSAGE_INTERRUPT_TIMEOUT_MS ?? "120000",
  10,
);
const USER_ID = "user-smoke-message-interrupt";
const FIRST_GOAL = "__HANDLE_SMOKE_HANG__ start a cancellable run";
const FOLLOW_UP = "Actually answer this follow-up instead.";

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
    HANDLE_SMOKE_AGENT: "1",
    HANDLE_TEST_AUTH_BYPASS: "1",
    NEXT_PUBLIC_HANDLE_API_BASE_URL: API_URL,
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
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
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
    if (error instanceof Error && error.message.includes("already responded")) throw error;
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
      // Starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function apiFetch(path, options = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-handle-test-user-id": USER_ID,
      ...(options.headers ?? {}),
    },
  });
}

async function createTask() {
  const response = await apiFetch("/api/tasks", {
    body: JSON.stringify({ backend: "local", goal: FIRST_GOAL }),
    method: "POST",
  });
  if (!response.ok) throw new Error(`/api/tasks returned ${response.status}`);
  const body = await response.json();
  if (!body.taskId) throw new Error("Task response did not include taskId");
  return body.taskId;
}

async function getTask(taskId) {
  const response = await apiFetch(`/api/tasks/${taskId}`);
  if (!response.ok) throw new Error(`/api/tasks/${taskId} returned ${response.status}`);
  return response.json();
}

async function waitForStatus(taskId, expected) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const task = await getTask(taskId);
    if (task.status === expected) return task;
    await delay(500);
  }
  throw new Error(`Timed out waiting for task ${taskId} to be ${expected}`);
}

async function sendFollowUp(conversationId) {
  const response = await apiFetch(`/api/conversations/${conversationId}/messages`, {
    body: JSON.stringify({ backend: "local", content: FOLLOW_UP }),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`/api/conversations/${conversationId}/messages returned ${response.status}`);
  }
  return response.json();
}

let api;

try {
  const env = smokeEnv();
  await assertPortFree(`${API_URL}/health`, "API port");
  runChecked("prisma-generate", ["--filter", "@handle/api", "prisma", "generate"], env);
  runChecked("prisma-migrate", ["--filter", "@handle/api", "prisma", "migrate", "deploy"], env);
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

  const firstTaskId = await createTask();
  const firstTask = await getTask(firstTaskId);
  if (!firstTask.conversationId) throw new Error("First task did not include conversationId");

  const followUp = await sendFollowUp(firstTask.conversationId);
  if (followUp.cancelledRunId !== firstTaskId) {
    throw new Error(`Expected ${firstTaskId} to be cancelled, got ${JSON.stringify(followUp)}`);
  }

  const cancelledTask = await waitForStatus(firstTaskId, "CANCELLED");
  const newTask = await waitForStatus(followUp.agentRunId, "STOPPED");
  const userMessages = newTask.messages
    .filter((message) => message.role === "USER")
    .map((message) => message.content);
  if (!userMessages.includes(FIRST_GOAL) || !userMessages.includes(FOLLOW_UP)) {
    throw new Error(`Conversation history did not include both user messages: ${JSON.stringify(userMessages)}`);
  }

  console.log(
    `[message-interrupt] PASS cancelled=${cancelledTask.id}; new=${newTask.id}; messages=${newTask.messages.length}`,
  );
} catch (error) {
  console.error(`[message-interrupt] ${error instanceof Error ? error.message : "failed"}`);
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  stopServer(api);
}
