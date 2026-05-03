import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });

const API_URL = process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const API_PORT = new URL(API_URL).port || "3001";
const TIMEOUT_MS = Number.parseInt(process.env.HANDLE_BACKEND_SWITCH_TIMEOUT_MS ?? "120000", 10);
const USER_ID = "user-smoke-backend-switch";

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
    throw new Error(`${label} already responded with ${response.status}; stop the existing dev server first`);
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

async function jsonFetch(path, options = {}) {
  const response = await apiFetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function waitForTask(taskId, expectedBackend) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const task = await jsonFetch(`/api/tasks/${taskId}`);
    if (task.status === "STOPPED" && task.backend === expectedBackend) return task;
    if (task.status === "ERROR" || task.status === "CANCELLED") {
      throw new Error(`Task ${taskId} reached ${task.status}: ${JSON.stringify(task)}`);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for task ${taskId} to stop on ${expectedBackend}`);
}

let api;
let projectId;

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

  const { project } = await jsonFetch("/api/projects", {
    body: JSON.stringify({
      defaultBackend: "E2B",
      name: `Smoke Backend Switch ${Date.now()}`,
      permissionMode: "ASK",
      workspaceScope: "DEFAULT_WORKSPACE",
    }),
    method: "POST",
  });
  projectId = project.id;
  const { conversation } = await jsonFetch(`/api/projects/${project.id}/conversations`, {
    body: JSON.stringify({ title: "Backend switch" }),
    method: "POST",
  });

  const first = await jsonFetch(`/api/conversations/${conversation.id}/messages`, {
    body: JSON.stringify({ content: "Run first on E2B" }),
    method: "POST",
  });
  await waitForTask(first.agentRunId, "e2b");

  await jsonFetch(`/api/projects/${project.id}`, {
    body: JSON.stringify({ defaultBackend: "LOCAL" }),
    method: "PUT",
  });

  const second = await jsonFetch(`/api/conversations/${conversation.id}/messages`, {
    body: JSON.stringify({ content: "Run next on Local Mac" }),
    method: "POST",
  });
  const secondTask = await waitForTask(second.agentRunId, "local");

  if (!secondTask.messages.some((message) => message.content === "Run first on E2B")) {
    throw new Error("Second run did not retain previous conversation history");
  }

  console.log(
    `[mid-conversation-backend-switch] PASS first=${first.agentRunId}:e2b second=${second.agentRunId}:local`,
  );
} catch (error) {
  console.error(`[mid-conversation-backend-switch] ${error instanceof Error ? error.message : "failed"}`);
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  if (projectId) {
    await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => undefined);
  }
  stopServer(api);
}
