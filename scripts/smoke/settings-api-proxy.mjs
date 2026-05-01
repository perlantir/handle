import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = new URL("../..", import.meta.url);
const WEB_URL =
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const WEB_PORT = new URL(WEB_URL).port || "3000";
const TIMEOUT_MS = 45_000;
const PROXY_LOOP_TEXT = "Failed to proxy http://localhost:3000";
const EXPECTED_AUTHORIZATION = "Bearer test-key-not-real";

const output = [];
const upstreamRequests = [];
let sawProxyLoop = false;

const proxyCalls = [
  {
    body: null,
    method: "GET",
    path: "/api/settings/providers",
  },
  {
    body: {
      baseURL: "http://127.0.0.1:11434/v1",
      enabled: true,
      fallbackOrder: 5,
      modelName: "Local Llama",
      primaryModel: "llama3.2",
    },
    method: "PUT",
    path: "/api/settings/providers/local",
  },
  {
    body: { value: "test-key-not-real" },
    method: "POST",
    path: "/api/settings/providers/openrouter/key",
  },
  {
    body: null,
    method: "DELETE",
    path: "/api/settings/providers/openrouter/key",
  },
  {
    body: null,
    method: "POST",
    path: "/api/settings/providers/openrouter/test",
  },
];

function recordOutput(label, chunk) {
  const text = chunk.toString();
  output.push(`[${label}] ${text}`);
  if (output.join("").length > 16_000) {
    output.splice(0, output.length - 30);
  }
  if (text.includes(PROXY_LOOP_TEXT)) sawProxyLoop = true;
}

function outputTail() {
  return output.join("").slice(-6_000);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function startMockApi() {
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    upstreamRequests.push({
      body,
      headers: request.headers,
      method: request.method,
      url: request.url,
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        path: request.url,
      }),
    );
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not read mock API address"));
        return;
      }

      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function spawnWeb(apiUrl) {
  const child = spawn(
    "pnpm",
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
      WEB_PORT,
    ],
    {
      cwd: ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        HANDLE_TEST_AUTH_BYPASS: "1",
        NEXT_PUBLIC_HANDLE_API_BASE_URL: apiUrl,
        NEXT_PUBLIC_HANDLE_TEST_AUTH_BYPASS: "1",
        NEXT_PUBLIC_HANDLE_WEB_BASE_URL: WEB_URL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => recordOutput("web", chunk));
  child.stderr.on("data", (chunk) => recordOutput("web", chunk));
  child.on("exit", (code, signal) => {
    recordOutput(
      "web",
      `exited code=${code ?? "null"} signal=${signal ?? "null"}\n`,
    );
  });

  return child;
}

function stopProcess(child) {
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

async function waitForWeb() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (sawProxyLoop) {
      throw new Error(`Next dev server printed ${PROXY_LOOP_TEXT}`);
    }

    try {
      const response = await fetch(`${WEB_URL}/sign-in`, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return;
    } catch {
      // The dev server is still starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${WEB_URL}/sign-in`);
}

function assertUpstreamRequests() {
  if (upstreamRequests.length !== proxyCalls.length) {
    throw new Error(
      `Mock API received ${upstreamRequests.length} requests, expected ${proxyCalls.length}`,
    );
  }

  proxyCalls.forEach((expected, index) => {
    const actual = upstreamRequests[index];
    if (!actual) throw new Error(`Missing upstream request ${index + 1}`);

    if (actual.method !== expected.method) {
      throw new Error(
        `Request ${index + 1} method was ${actual.method}, expected ${expected.method}`,
      );
    }

    if (actual.url !== expected.path) {
      throw new Error(
        `Request ${index + 1} path was ${actual.url}, expected ${expected.path}`,
      );
    }

    if (actual.headers.authorization !== EXPECTED_AUTHORIZATION) {
      throw new Error(
        `Request ${index + 1} Authorization was ${actual.headers.authorization ?? "missing"}`,
      );
    }

    if (expected.body) {
      const parsed = JSON.parse(actual.body);
      if (JSON.stringify(parsed) !== JSON.stringify(expected.body)) {
        throw new Error(
          `Request ${index + 1} body was ${actual.body}, expected ${JSON.stringify(expected.body)}`,
        );
      }
      const contentType = actual.headers["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          `Request ${index + 1} Content-Type was ${contentType || "missing"}`,
        );
      }
    } else if (actual.body !== "") {
      throw new Error(
        `Request ${index + 1} body was ${actual.body}, expected empty`,
      );
    }
  });
}

async function hitProxyRoutes(page) {
  for (const call of proxyCalls) {
    const result = await page.evaluate(async ({ body, method, path }) => {
      const response = await fetch(path, {
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        method,
      });

      return {
        body: await response.json(),
        status: response.status,
      };
    }, call);

    if (result.status !== 200) {
      throw new Error(
        `${call.method} ${call.path} returned ${result.status}: ${JSON.stringify(result.body)}`,
      );
    }
  }
}

let browser;
let mockApi;
let web;

try {
  mockApi = await startMockApi();
  web = spawnWeb(mockApi.url);
  await waitForWeb();

  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${WEB_URL}/sign-in`);
  await hitProxyRoutes(page);

  if (pageErrors.length > 0) {
    throw new Error(`Browser errors were reported: ${pageErrors.join(" | ")}`);
  }

  assertUpstreamRequests();

  console.log(
    `[smoke:settings-api-proxy] ${proxyCalls.length} Settings provider proxy routes forwarded to ${mockApi.url}`,
  );
} catch (error) {
  console.error(
    `[smoke:settings-api-proxy] ${
      error instanceof Error ? error.message : "failed"
    }`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  stopProcess(web);
  if (mockApi) {
    await new Promise((resolve) => mockApi.server.close(resolve));
  }
}
