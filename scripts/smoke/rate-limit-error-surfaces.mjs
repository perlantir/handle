import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createPhase1ToolDefinitions } from "../../apps/api/src/agent/tools";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-rate-limit-surface-${Date.now()}`;
const projectId = "smoke-rate-limit-surface";
const root = await fs.mkdtemp(join(tmpdir(), "handle-rate-limit-surface-"));
const workspaceDir = join(root, "workspace");
const auditLogPath = join(homedir(), "Library", "Logs", "Handle", "audit.log");

function fakeSandbox() {
  return {
    sandboxId: "local-rate-limit-smoke",
    commands: { async run() {} },
    files: {
      async list() {
        return [];
      },
      async read() {
        return "";
      },
      async write() {},
    },
    async kill() {},
  };
}

async function readRateLimitAuditEntries() {
  try {
    const raw = await fs.readFile(auditLogPath, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.taskId === taskId && entry.matchedPattern === "rate_limit");
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

try {
  const backend = new LocalBackend(taskId, { projectId, workspaceDir });
  await backend.initialize(taskId);

  const shellExec = createPhase1ToolDefinitions().find((definition) => definition.name === "shell_exec");
  if (!shellExec) throw new Error("shell_exec tool definition missing");

  const results = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      shellExec.implementation(
        { command: `echo surface-${index}` },
        {
          backend,
          sandbox: fakeSandbox(),
          taskId,
        },
      ),
    ),
  );

  const parsed = results.map((result) => JSON.parse(result));
  const allowed = parsed.filter((result) => result.exitCode === 0);
  const rateLimited = parsed.filter(
    (result) =>
      result.exitCode === 429 &&
      String(result.stderr).includes("Shell execution rate limit exceeded; max 10 commands per second per task."),
  );
  const auditEntries = await readRateLimitAuditEntries();

  if (allowed.length !== 10) {
    throw new Error(`Expected 10 allowed shell tool observations, got ${allowed.length}`);
  }
  if (rateLimited.length !== 40) {
    throw new Error(`Expected 40 rate-limited tool observations, got ${rateLimited.length}`);
  }
  if (auditEntries.length !== 40) {
    throw new Error(`Expected 40 rate_limit audit entries, got ${auditEntries.length}`);
  }

  console.log("[rate-limit-error-surfaces] PASS 40 rate-limit errors surfaced as tool observations and audit entries");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
