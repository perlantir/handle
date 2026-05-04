#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listActionLogEntries, undoActionLogEntry } from "../../apps/api/src/lib/actionLog.ts";
import { createPhase1ToolDefinitions } from "../../apps/api/src/agent/tools.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const taskId = `action-log-run-${suffix}`;
const conversationId = `action-log-conversation-${suffix}`;
const projectId = `action-log-project-${suffix}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-action-log-smoke-"));
const workspaceDir = join(root, "workspace");
await fs.mkdir(workspaceDir, { recursive: true });

const backend = {
  id: "local",
  async browserSession() {
    throw new Error("Browser session not needed for action log smoke");
  },
  async fileDelete(path) {
    await fs.rm(resolvePath(path), { force: true });
  },
  async fileList(path) {
    const entries = await fs.readdir(resolvePath(path), { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const stat = await fs.stat(join(resolvePath(path), entry.name));
        return { isDir: entry.isDirectory(), name: entry.name, size: stat.size };
      }),
    );
  },
  async fileRead(path) {
    return fs.readFile(resolvePath(path), "utf8");
  },
  async fileWrite(path, content) {
    const resolved = resolvePath(path);
    await fs.mkdir(join(resolved, ".."), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
  },
  getWorkspaceDir() {
    return workspaceDir;
  },
  async initialize() {},
  async shellExec(command, opts) {
    await opts.onStdout("hello\n");
    return { exitCode: 0, stderr: "", stdout: "hello\n" };
  },
  async shutdown() {},
};

const context = {
  backend,
  conversationId,
  memoryProject: { id: projectId, memoryScope: "PROJECT_ONLY" },
  projectId,
  sandbox: {
    commands: { run: async () => ({ exitCode: 0, stderr: "", stdout: "" }) },
    files: {
      list: async () => [],
      read: async () => "",
      write: async () => undefined,
    },
    kill: async () => undefined,
    sandboxId: "local-action-log-smoke",
  },
  taskId,
};

try {
  const tools = createPhase1ToolDefinitions();
  const fileWrite = tools.find((tool) => tool.name === "file_write");
  const shellExec = tools.find((tool) => tool.name === "shell_exec");
  assert(fileWrite, "file_write tool missing");
  assert(shellExec, "shell_exec tool missing");

  const target = join(workspaceDir, `note-${suffix}.txt`);
  console.log(`[action-log] writing ${target}`);
  await fileWrite.implementation({ content: "reminder", path: target }, context);

  console.log("[action-log] running shell command");
  await shellExec.implementation({ command: `echo action-log-${suffix}` }, context);

  const entries = await listActionLogEntries(1000);
  const fileEntry = entries.find(
    (entry) =>
      entry.conversationId === conversationId &&
      entry.outcomeType === "file_created" &&
      entry.target === target,
  );
  const shellEntry = entries.find(
    (entry) =>
      entry.conversationId === conversationId &&
      entry.outcomeType === "shell_command_executed" &&
      entry.target.includes(`action-log-${suffix}`),
  );
  assert(fileEntry, "file_created action log entry missing");
  assert(shellEntry, "shell_command_executed action log entry missing");
  assert(fileEntry.reversible, "file_created entry should be reversible");

  console.log("[action-log] undoing file creation");
  await undoActionLogEntry(fileEntry.id);
  await fs.access(target)
    .then(() => {
      throw new Error("Undo did not remove created file");
    })
    .catch((err) => {
      if (!(err instanceof Error) || !("code" in err) || err.code !== "ENOENT") throw err;
    });

  const afterUndo = await listActionLogEntries(1000);
  assert(
    afterUndo.some(
      (entry) =>
        entry.conversationId === conversationId &&
        entry.outcomeType === "file_deleted" &&
        entry.target === target,
    ),
    "file_deleted undo action log entry missing",
  );

  console.log("[action-log] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}

function resolvePath(path) {
  return path.startsWith("/") ? path : join(workspaceDir, path);
}
