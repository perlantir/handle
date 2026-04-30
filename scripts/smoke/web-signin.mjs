import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const WEB_URL =
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const API_URL =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const TASK_AUTH_TOKEN = process.env.HANDLE_SMOKE_AUTH_TOKEN;
const PROXY_LOOP_TEXT = "Failed to proxy http://localhost:3000";
const TIMEOUT_MS = 45_000;
const API_TIMEOUT_MS = 2_500;

const output = [];
let sawProxyLoop = false;

function recordOutput(chunk) {
  const text = chunk.toString();
  output.push(text);
  if (output.join("").length > 12_000) {
    output.splice(0, output.length - 20);
  }
  if (text.includes(PROXY_LOOP_TEXT)) {
    sawProxyLoop = true;
  }
}

function outputTail() {
  return output.join("").slice(-4_000);
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (sawProxyLoop) {
      throw new Error(`Next dev server printed ${PROXY_LOOP_TEXT}`);
    }

    try {
      const response = await fetch(`${WEB_URL}/sign-in`, {
        redirect: "manual",
      });
      if (response.status === 200) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${WEB_URL}/sign-in`);
}

async function assertNoSelfProxyRedirect() {
  const signInResponse = await fetch(`${WEB_URL}/sign-in`, {
    redirect: "manual",
  });
  if (signInResponse.status !== 200) {
    throw new Error(`/sign-in returned ${signInResponse.status}, expected 200`);
  }

  const rootResponse = await fetch(WEB_URL, { redirect: "manual" });
  const location = rootResponse.headers.get("location") ?? "";

  if (![307, 308].includes(rootResponse.status)) {
    throw new Error(
      `/ returned ${rootResponse.status}, expected a protected-route redirect`,
    );
  }

  if (location.includes("localhost:3000")) {
    throw new Error(
      `/ redirected to ${location}, expected no localhost self-proxy target`,
    );
  }

  await delay(500);

  if (sawProxyLoop) {
    throw new Error(`Next dev server printed ${PROXY_LOOP_TEXT}`);
  }
}

function assertCorsHeader(response, name, expected) {
  const actual = response.headers.get(name);
  if (actual !== expected) {
    throw new Error(`${name} was ${actual ?? "missing"}, expected ${expected}`);
  }
}

function assertHeaderContains(response, name, expected) {
  const actual = response.headers.get(name) ?? "";
  if (!actual.includes(expected)) {
    throw new Error(`${name} was ${actual || "missing"}, expected ${expected}`);
  }
}

async function fetchApi(path, init = {}) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

async function assertTaskPostCors() {
  try {
    await fetchApi("/health");
  } catch {
    console.log(
      `[smoke:web-signin] ${API_URL} is not reachable; skipped task POST CORS smoke`,
    );
    return;
  }

  const preflight = await fetchApi("/api/tasks", {
    headers: {
      "Access-Control-Request-Headers": "Content-Type, Authorization",
      "Access-Control-Request-Method": "POST",
      Origin: WEB_URL,
    },
    method: "OPTIONS",
    redirect: "manual",
  });

  if (preflight.status !== 204) {
    throw new Error(
      `/api/tasks preflight returned ${preflight.status}, expected 204`,
    );
  }

  assertCorsHeader(preflight, "access-control-allow-origin", WEB_URL);
  assertCorsHeader(preflight, "access-control-allow-credentials", "true");
  for (const method of ["GET", "POST", "OPTIONS"]) {
    assertHeaderContains(preflight, "access-control-allow-methods", method);
  }
  for (const header of ["Authorization", "Content-Type"]) {
    assertHeaderContains(preflight, "access-control-allow-headers", header);
  }

  const taskResponse = await fetchApi("/api/tasks", {
    body: JSON.stringify({
      goal: "Smoke test CORS task POST",
      skipAgent: Boolean(TASK_AUTH_TOKEN),
    }),
    headers: {
      Authorization: `Bearer ${TASK_AUTH_TOKEN ?? "test-key-not-real"}`,
      "Content-Type": "application/json",
      Origin: WEB_URL,
    },
    method: "POST",
    redirect: "manual",
  });

  assertCorsHeader(taskResponse, "access-control-allow-origin", WEB_URL);
  assertCorsHeader(taskResponse, "access-control-allow-credentials", "true");

  if (TASK_AUTH_TOKEN && !taskResponse.ok) {
    throw new Error(
      `/api/tasks authenticated POST returned ${taskResponse.status}, expected success`,
    );
  }

  console.log(
    `[smoke:web-signin] ${API_URL}/api/tasks POST returned ${taskResponse.status} with CORS headers`,
  );
}

function stopServer(child) {
  if (child.killed) return;

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

const child = spawn("pnpm", ["--filter", "@handle/web", "dev"], {
  cwd: new URL("../..", import.meta.url),
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_HANDLE_API_BASE_URL: API_URL,
    NEXT_PUBLIC_HANDLE_WEB_BASE_URL: WEB_URL,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", recordOutput);
child.stderr.on("data", recordOutput);

try {
  await waitForServer();
  await assertNoSelfProxyRedirect();
  await assertTaskPostCors();
  console.log(
    `[smoke:web-signin] ${WEB_URL}/sign-in loaded without localhost self-proxy errors`,
  );
} catch (error) {
  console.error(
    `[smoke:web-signin] ${error instanceof Error ? error.message : "failed"}`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  stopServer(child);
}
