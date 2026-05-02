import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
const requireFromApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);

loadDotenv({ path: new URL(".env", ROOT) });

const KEYCHAIN_SERVICE = "com.perlantir.handle";
const TEST_USER_ID = "user-smoke-e2e";
const CANONICAL_GOAL =
  "Write a Python script that fetches the top 10 Hacker News stories from https://news.ycombinator.com and saves them as JSON to /tmp/hn.json, then run the script once and show me the contents.";
const MIN_TASK_TIMEOUT_MS = 5 * 60 * 1000;
const TASK_TIMEOUT_MS = Math.max(
  MIN_TASK_TIMEOUT_MS,
  Number.parseInt(
    process.env.HANDLE_E2E_PROVIDERS_TASK_TIMEOUT_MS ?? "420000",
    10,
  ),
);
const STARTUP_TIMEOUT_MS = 90_000;

const providerRuns = [
  {
    authMode: "apiKey",
    credentialAccounts: ["openai:apiKey"],
    id: "openai",
    key: "openai-apikey",
    label: "OpenAI apiKey",
    primaryModel: "gpt-4o",
  },
  {
    authMode: "chatgpt-oauth",
    credentialAccounts: [
      "openai:chatgpt:accessToken",
      "openai:chatgpt:refreshToken",
      "openai:chatgpt:expires",
      "openai:chatgpt:accountId",
    ],
    id: "openai",
    key: "openai-chatgpt-oauth",
    label: "OpenAI chatgpt-oauth",
    primaryModel:
      process.env.HANDLE_E2E_OPENAI_CHATGPT_MODEL ?? "gpt-5.3-codex",
  },
  {
    credentialAccounts: ["anthropic:apiKey"],
    id: "anthropic",
    key: "anthropic",
    label: "Anthropic",
    primaryModel: "claude-opus-4-7",
  },
  {
    baseURL: "https://api.moonshot.ai/v1",
    credentialAccounts: ["kimi:apiKey"],
    id: "kimi",
    key: "kimi",
    label: "KIMI",
    primaryModel: "kimi-k2.6",
  },
  {
    baseURL: "https://openrouter.ai/api/v1",
    credentialAccounts: ["openrouter:apiKey"],
    id: "openrouter",
    key: "openrouter",
    label: "OpenRouter",
    primaryModel: "anthropic/claude-opus-4.7",
  },
  {
    baseURL: "http://127.0.0.1:11434/v1",
    credentialAccounts: [],
    id: "local",
    key: "local",
    label: "Local",
    modelName: "Local LLM",
    primaryModel: "llama3.1:8b",
  },
];

const output = [];

function onlyFilter() {
  const arg = process.argv.find((value) => value.startsWith("--only="));
  const value = arg?.slice("--only=".length).trim();
  if (!value) return null;

  const allowed = new Set(providerRuns.map((run) => run.key));
  if (!allowed.has(value)) {
    throw new Error(
      `Unknown --only provider key "${value}". Expected one of: ${Array.from(allowed).join(", ")}`,
    );
  }

  return value;
}

function recordOutput(label, chunk) {
  const text = chunk.toString();
  output.push(`[${label}] ${text}`);
  if (output.join("").length > 30_000) {
    output.splice(0, output.length - 60);
  }
}

function outputTail() {
  return output.join("").slice(-10_000);
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

async function urlResponds(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(700) });
    return true;
  } catch {
    return false;
  }
}

async function findApiUrl() {
  if (process.env.HANDLE_E2E_PROVIDERS_API_BASE_URL) {
    const explicit = process.env.HANDLE_E2E_PROVIDERS_API_BASE_URL;
    if (await urlResponds(`${explicit}/health`)) {
      throw new Error(
        `${explicit} is already responding; stop it or choose another HANDLE_E2E_PROVIDERS_API_BASE_URL`,
      );
    }
    return explicit;
  }

  for (const port of [3001, 3002, 3003, 3004, 3005]) {
    const candidate = `http://127.0.0.1:${port}`;
    if (!(await urlResponds(`${candidate}/health`))) return candidate;
  }

  throw new Error("No free API port found in 3001-3005.");
}

function smokeEnv(apiUrl) {
  const apiPort = new URL(apiUrl).port || "3001";

  return {
    ...process.env,
    HANDLE_API_BASE_URL: apiUrl,
    HANDLE_API_HOST: "127.0.0.1",
    HANDLE_API_PORT: apiPort,
    HANDLE_TEST_AUTH_BYPASS: "1",
    NEXT_PUBLIC_HANDLE_API_BASE_URL: apiUrl,
    NEXT_PUBLIC_HANDLE_TEST_AUTH_BYPASS: "1",
    NODE_ENV: "test",
  };
}

function assertBaseEnv(env) {
  const missing = ["DATABASE_URL", "E2B_API_KEY"].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Provider smoke requires ${missing.join(", ")} in the root .env or environment`,
    );
  }
}

async function waitForServer(url, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(url, {
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

function authHeaders() {
  return { "x-handle-test-user-id": TEST_USER_ID };
}

async function apiFetch(apiUrl, path, options = {}) {
  const headers = {
    ...authHeaders(),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });

  return response;
}

async function createTask(apiUrl, providerId) {
  const response = await apiFetch(apiUrl, "/api/tasks", {
    body: JSON.stringify({
      goal: CANONICAL_GOAL,
      providerOverride: providerId,
    }),
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`/api/tasks returned ${response.status}: ${body}`);
  }

  const payload = await response.json();
  if (!payload.taskId) throw new Error("Task response did not include taskId.");

  return payload.taskId;
}

async function waitForTaskEvents(apiUrl, taskId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);
  const events = [];
  let sawToolCall = false;
  let finalStatus = null;
  let finalStatusEvent = null;

  try {
    const response = await apiFetch(apiUrl, `/api/tasks/${taskId}/stream`, {
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
          if (event.type === "tool_call") sawToolCall = true;
          if (
            event.type === "status_update" &&
            ["STOPPED", "ERROR"].includes(event.status)
          ) {
            finalStatus = event.status;
            finalStatusEvent = event;
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

  if (!finalStatus) {
    throw new Error(
      `Task ${taskId} did not emit a terminal status_update event`,
    );
  }

  return { events, finalStatus, finalStatusEvent, sawToolCall };
}

function truncate(value, maxLength = 1_200) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function eventCounts(events) {
  return events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

function lastEvent(events, type) {
  return events.findLast((event) => event.type === type) ?? null;
}

function taskDiagnostics(events, finalStatusEvent) {
  const lastAssistant = lastEvent(events, "message");
  const lastError = lastEvent(events, "error");
  const lastToolCall = lastEvent(events, "tool_call");
  const lastToolResult = lastEvent(events, "tool_result");

  return [
    `SSE event counts: ${JSON.stringify(eventCounts(events))}`,
    `Final status_update: ${truncate(finalStatusEvent ?? lastEvent(events, "status_update"))}`,
    `Last error event: ${truncate(lastError) || "<none>"}`,
    `Last assistant message: ${truncate(lastAssistant?.content) || "<none>"}`,
    `Last tool_call: ${truncate(lastToolCall) || "<none>"}`,
    `Last tool_result: ${truncate(lastToolResult?.result) || "<none>"}`,
  ].join("\n");
}

function candidateStringsFromEvents(events) {
  const candidates = [];

  for (const event of events) {
    if (event.type === "message" && typeof event.content === "string") {
      candidates.push(event.content);
    }

    if (event.type !== "tool_result" || typeof event.result !== "string") {
      continue;
    }

    candidates.push(event.result);

    try {
      const parsed = JSON.parse(event.result);
      for (const key of ["stdout", "stderr", "result"]) {
        if (typeof parsed?.[key] === "string") candidates.push(parsed[key]);
      }
    } catch {
      // Tool output is often plain text.
    }
  }

  return candidates;
}

function parseJsonArrays(text) {
  const arrays = [];

  for (
    let start = text.indexOf("[");
    start >= 0;
    start = text.indexOf("[", start + 1)
  ) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) arrays.push(parsed);
          } catch {
            // Keep scanning for the next array-shaped substring.
          }
          break;
        }
      }
    }
  }

  return arrays;
}

function isValidHnEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    typeof entry.title === "string" &&
    entry.title.trim().length > 0 &&
    typeof entry.url === "string" &&
    entry.url.trim().length > 0 &&
    Object.prototype.hasOwnProperty.call(entry, "score") &&
    String(entry.score ?? "").trim().length > 0
  );
}

function findHnEntries(events) {
  for (const candidate of candidateStringsFromEvents(events)) {
    for (const array of parseJsonArrays(candidate)) {
      const validEntries = array.filter(isValidHnEntry);
      if (validEntries.length > 5) return validEntries;
    }
  }

  return [];
}

function assertCanonicalResult(events, finalStatus, sawToolCall) {
  if (finalStatus !== "STOPPED") {
    throw new Error(`Task ended with ${finalStatus}, expected STOPPED`);
  }

  if (!sawToolCall) {
    throw new Error("Task reached STOPPED without emitting a tool_call event");
  }

  const assistantMessages = events
    .filter(
      (event) => event.type === "message" && typeof event.content === "string",
    )
    .map((event) => event.content);
  if (
    assistantMessages.some((message) => message.includes("[[HANDLE_RESULT:"))
  ) {
    throw new Error(
      "Final assistant message still contains the Handle result marker",
    );
  }

  const entries = findHnEntries(events);
  if (entries.length <= 5) {
    throw new Error(
      `Did not stream a valid /tmp/hn.json payload with more than 5 entries; saw ${entries.length}`,
    );
  }

  return entries;
}

function readKeychain(account) {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
    { encoding: "utf8" },
  );

  if (result.status !== 0) return null;

  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

async function localProviderAvailable(baseURL) {
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function skipReason(run) {
  if (run.id === "local") {
    const available = await localProviderAvailable(run.baseURL);
    return available
      ? null
      : `${run.baseURL}/models did not respond; start Ollama or LM Studio`;
  }

  const missingAccounts = run.credentialAccounts.filter(
    (account) => !readKeychain(account),
  );
  if (missingAccounts.length > 0) {
    return `missing Keychain credential(s): ${missingAccounts.join(", ")}`;
  }

  return null;
}

function providerUpdateForRun(run) {
  return {
    authMode: run.authMode ?? "apiKey",
    baseURL: run.baseURL ?? null,
    enabled: true,
    fallbackOrder: 1,
    modelName: run.modelName ?? run.primaryModel,
    primaryModel: run.primaryModel,
  };
}

async function snapshotProviderConfigs(prisma) {
  return prisma.providerConfig.findMany({
    orderBy: { fallbackOrder: "asc" },
  });
}

async function configureOnlyProvider(prisma, run) {
  await prisma.$transaction([
    prisma.providerConfig.updateMany({ data: { enabled: false } }),
    prisma.providerConfig.update({
      data: providerUpdateForRun(run),
      where: { id: run.id },
    }),
  ]);
}

async function verifyProviderIsolation(apiUrl, run) {
  let lastSnapshot = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await apiFetch(apiUrl, "/api/settings/providers");
    if (!response.ok) {
      throw new Error(
        `/api/settings/providers returned ${response.status} while verifying provider isolation`,
      );
    }

    const { providers } = await response.json();
    lastSnapshot = providers;
    const selected = providers.find((provider) => provider.id === run.id);
    const othersDisabled = providers
      .filter((provider) => provider.id !== run.id)
      .every((provider) => provider.enabled === false);
    const authModeMatches =
      run.id !== "openai" || selected?.authMode === (run.authMode ?? "apiKey");
    const baseURLMatches = !run.baseURL || selected?.baseURL === run.baseURL;
    const modelMatches = selected?.primaryModel === run.primaryModel;

    if (
      selected?.enabled === true &&
      othersDisabled &&
      authModeMatches &&
      baseURLMatches &&
      modelMatches
    ) {
      console.log(
        `[smoke:e2e-providers] ${run.label}: verified provider isolation (${run.primaryModel})`,
      );
      return;
    }

    await delay(250);
  }

  throw new Error(
    `Provider isolation did not settle for ${run.label}: ${truncate(lastSnapshot, 2_000)}`,
  );
}

async function restoreProviderConfigs(prisma, snapshot) {
  if (!snapshot) return;

  for (const row of snapshot) {
    await prisma.providerConfig.update({
      data: {
        authMode: row.authMode,
        baseURL: row.baseURL,
        enabled: row.enabled,
        fallbackOrder: row.fallbackOrder,
        modelName: row.modelName,
        primaryModel: row.primaryModel,
      },
      where: { id: row.id },
    });
  }
}

async function runProviderSmoke({ apiUrl, prisma, run }) {
  await configureOnlyProvider(prisma, run);
  await verifyProviderIsolation(apiUrl, run);

  console.log(`[smoke:e2e-providers] ${run.label}: starting ${CANONICAL_GOAL}`);
  const taskId = await createTask(apiUrl, run.id);
  console.log(`[smoke:e2e-providers] ${run.label}: task ${taskId} created`);

  const { events, finalStatus, finalStatusEvent, sawToolCall } =
    await waitForTaskEvents(apiUrl, taskId);
  console.log(
    `[smoke:e2e-providers] ${run.label}: final status ${finalStatus}; ${events.length} SSE events; counts ${JSON.stringify(eventCounts(events))}`,
  );

  let entries;
  try {
    entries = assertCanonicalResult(events, finalStatus, sawToolCall);
  } catch (error) {
    console.error(
      `[smoke:e2e-providers] ${run.label}: task diagnostics for ${taskId}\n${taskDiagnostics(events, finalStatusEvent)}`,
    );
    throw error;
  }

  console.log(
    `[smoke:e2e-providers] ${run.label}: PASS task ${taskId}, ${entries.length} HN entries, ${events.length} SSE events`,
  );

  return { entries: entries.length, status: "PASS", taskId };
}

function printSummary(results, runs) {
  const summary = runs
    .map((run) => {
      const result = results.find((item) => item.label === run.label);
      if (!result) return `${run.label}: NOT RUN`;
      if (result.status === "PASS") return `${run.label}: PASS`;
      if (result.status === "SKIP") return `${run.label}: SKIP`;
      return `${run.label}: FAIL`;
    })
    .join(" | ");

  console.log(`[smoke:e2e-providers] ${summary}`);
}

let api;
let prisma;
let snapshot;
const results = [];

try {
  if (process.env.CI === "true") {
    console.log(
      "[smoke:e2e-providers] Skipping in CI; this smoke test requires local Keychain credentials, real provider APIs, E2B, and Ollama for local mode.",
    );
    process.exit(0);
  }

  const apiUrl = await findApiUrl();
  const filter = onlyFilter();
  const runs = filter
    ? providerRuns.filter((run) => run.key === filter)
    : providerRuns;
  const env = smokeEnv(apiUrl);
  assertBaseEnv(env);

  console.log(
    filter
      ? `[smoke:e2e-providers] Running only ${filter}; expected runtime: 1-3 minutes.`
      : "[smoke:e2e-providers] Expected runtime: 10-15 minutes with all six provider configurations.",
  );
  console.log(`[smoke:e2e-providers] Starting isolated API at ${apiUrl}`);

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

  const { PrismaClient } = requireFromApi("@prisma/client");
  prisma = new PrismaClient();
  snapshot = await snapshotProviderConfigs(prisma);

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
  await waitForServer(`${apiUrl}/health`, "API");

  for (const run of runs) {
    const reason = await skipReason(run);
    if (reason) {
      console.log(`[smoke:e2e-providers] ${run.label}: SKIP (${reason})`);
      results.push({ label: run.label, reason, status: "SKIP" });
      continue;
    }

    try {
      const result = await runProviderSmoke({ apiUrl, prisma, run });
      results.push({ label: run.label, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[smoke:e2e-providers] ${run.label}: FAIL ${message}`);
      results.push({ label: run.label, message, status: "FAIL" });
    }
  }

  printSummary(results, runs);

  const failures = results.filter((result) => result.status === "FAIL");
  if (failures.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `[smoke:e2e-providers] ${
      error instanceof Error ? error.message : "failed"
    }`,
  );
  console.error(outputTail());
  process.exitCode = 1;
} finally {
  if (prisma && snapshot) {
    await restoreProviderConfigs(prisma, snapshot).catch((error) => {
      console.error(
        `[smoke:e2e-providers] Failed to restore ProviderConfig snapshot: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = 1;
    });
  }

  await prisma?.$disconnect().catch(() => {});
  stopServer(api);
}
