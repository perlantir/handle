import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const WEB_URL =
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const API_URL =
  process.env.NEXT_PUBLIC_HANDLE_API_BASE_URL ?? "http://127.0.0.1:3001";
const PROXY_LOOP_TEXT = "Failed to proxy http://localhost:3000";
const TIMEOUT_MS = 45_000;

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
