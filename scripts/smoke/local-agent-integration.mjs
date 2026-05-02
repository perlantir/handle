import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });

const API_URL =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const API_PORT = new URL(API_URL).port || "3001";
const TIMEOUT_MS = Number.parseInt(
  process.env.HANDLE_LOCAL_AGENT_INTEGRATION_TIMEOUT_MS ?? "360000",
  10,
);
const USER_ID = "user-smoke-local-agent";
const AUDIT_LOG_PATH = join(homedir(), "Library", "Logs", "Handle", "audit.log");
const WORKSPACE_BASE_DIR = join(
  homedir(),
  "Documents",
  "Handle",
  "workspaces",
);
const GOAL = [
  "Use the local file tools to create a Python script named primes.py in your task workspace.",
  "The script should print the first 10 prime numbers.",
  "Run it with python3, read the output, and report the primes.",
  "Use the workspace path for all files. Do not use /home/user or /tmp for task artifacts.",
].join(" ");

const output = [];

function recordOutput(label, chunk) {
  const text = chunk.toString();
  output.push(`[${label}] ${text}`);
  if (output.join("").length > 20_000) {
    output.splice(0, output.length - 40);
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
    body: JSON.stringify({ backend: "local", goal: GOAL }),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`/api/tasks returned ${response.status}`);
  }

  const body = await response.json();
  if (!body.taskId) throw new Error("Task response did not include taskId");
  return body.taskId;
}

function isSafeSmokeApproval(event, workspaceDir) {
  const request = event.request ?? {};
  if (request.type !== "shell_exec" || typeof request.command !== "string") {
    return false;
  }

  const command = request.command;
  return (
    command.includes(workspaceDir) &&
    command.includes("python3") &&
    command.includes("primes.py") &&
    !/sudo|rm\s+-rf|shutdown|\/System|\/private\/etc/.test(command)
  );
}

async function approveSmokeRequest(event) {
  const response = await apiFetch("/api/approvals/respond", {
    body: JSON.stringify({
      approvalId: event.approvalId,
      decision: "approved",
    }),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `/api/approvals/respond returned ${response.status} for ${event.approvalId}`,
    );
  }
}

async function waitForTaskEvents(taskId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const events = [];
  let finalStatus = null;
  const workspaceDir = join(WORKSPACE_BASE_DIR, taskId);

  try {
    const response = await apiFetch(`/api/tasks/${taskId}/stream`, {
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`/api/tasks/${taskId}/stream returned ${response.status}`);
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
          if (event.type === "approval_request") {
            if (!isSafeSmokeApproval(event, workspaceDir)) {
              throw new Error(
                `Unexpected approval request during smoke: ${JSON.stringify(event.request)}`,
              );
            }
            console.log(
              `[local-agent-integration] auto-approving safe workspace command: ${event.request.command}`,
            );
            await approveSmokeRequest(event);
          }
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

  return { events, finalStatus };
}

async function readAuditEntries(taskId) {
  const text = await fs.readFile(AUDIT_LOG_PATH, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.taskId === taskId);
}

async function assertLocalWorkspace(taskId, events) {
  const workspaceDir = join(WORKSPACE_BASE_DIR, taskId);
  const scriptPath = join(workspaceDir, "primes.py");
  const script = await fs.readFile(scriptPath, "utf8");
  if (!script.includes("prime")) {
    throw new Error(`${scriptPath} exists but does not look like a prime script`);
  }

  const entries = await fs.readdir(workspaceDir);
  if (!entries.includes("primes.py")) {
    throw new Error(`Workspace ${workspaceDir} does not contain primes.py`);
  }

  const auditEntries = await readAuditEntries(taskId);
  const fileWrite = auditEntries.find(
    (entry) =>
      entry.action === "file_write" &&
      entry.decision === "allow" &&
      String(entry.target).startsWith(workspaceDir),
  );
  if (!fileWrite) {
    throw new Error(
      `audit.log did not include an allowed file_write inside ${workspaceDir}`,
    );
  }

  if (
    auditEntries.some(
      (entry) =>
        String(entry.target).includes("/home/user") ||
        String(entry.target).includes("/tmp/primes.py"),
    )
  ) {
    throw new Error("audit.log shows task artifact access outside the local workspace");
  }

  const assistantText = events
    .filter((event) => event.type === "message" && typeof event.content === "string")
    .map((event) => event.content)
    .join("\n");
  for (const prime of ["2", "3", "5", "7", "11", "13", "17", "19", "23", "29"]) {
    if (!assistantText.includes(prime)) {
      throw new Error(`Assistant response did not include prime ${prime}`);
    }
  }

  return { auditEntryCount: auditEntries.length, scriptPath, workspaceDir };
}

let api;

try {
  const env = smokeEnv();
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
  console.log(`[local-agent-integration] task ${taskId} created`);
  const { events, finalStatus } = await waitForTaskEvents(taskId);
  if (finalStatus !== "STOPPED") {
    throw new Error(`Task ended with ${finalStatus}, expected STOPPED`);
  }

  const result = await assertLocalWorkspace(taskId, events);
  console.log("[local-agent-integration] PASS");
  console.log(`[local-agent-integration] workspace: ${result.workspaceDir}`);
  console.log(`[local-agent-integration] script: ${result.scriptPath}`);
  console.log(
    `[local-agent-integration] audit entries for task: ${result.auditEntryCount}`,
  );
} catch (error) {
  console.error(
    `[local-agent-integration] ${error instanceof Error ? error.message : "failed"}`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  stopServer(api);
}
