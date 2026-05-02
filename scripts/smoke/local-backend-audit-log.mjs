import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-local-audit-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-local-audit-"));
const workspaceDir = join(root, "workspace");
const auditLogPath = join(homedir(), "Library", "Logs", "Handle", "audit.log");

function assertAuditEntry(entry, action, decision) {
  for (const field of ["timestamp", "taskId", "action", "target", "decision", "workspaceDir"]) {
    if (!(field in entry)) throw new Error(`Missing audit field ${field}: ${JSON.stringify(entry)}`);
  }
  if (entry.taskId !== taskId) throw new Error(`Unexpected taskId ${entry.taskId}`);
  if (entry.action !== action) throw new Error(`Expected action ${action}, got ${entry.action}`);
  if (entry.decision !== decision) throw new Error(`Expected decision ${decision}, got ${entry.decision}`);
  if (Number.isNaN(Date.parse(entry.timestamp))) throw new Error(`Invalid timestamp ${entry.timestamp}`);
  if (entry.workspaceDir !== workspaceDir) throw new Error(`Unexpected workspaceDir ${entry.workspaceDir}`);
}

try {
  const backend = new LocalBackend(taskId, { workspaceDir });
  await backend.initialize(taskId);
  await backend.fileWrite("audit.txt", "audit smoke\n");
  await backend.shellExec("echo audit-smoke", {
    onStderr: () => {},
    onStdout: () => {},
  });
  await backend.fileDelete("audit.txt");

  const log = await fs.readFile(auditLogPath, "utf8");
  const entries = log
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.taskId === taskId);

  if (entries.length !== 3) {
    throw new Error(`Expected 3 audit entries for ${taskId}, got ${entries.length}`);
  }

  assertAuditEntry(entries[0], "file_write", "allow");
  assertAuditEntry(entries[1], "shell_exec", "allow");
  assertAuditEntry(entries[2], "file_delete", "allow");

  console.log(`[local-backend-audit-log] PASS wrote 3 entries to ${auditLogPath}`);
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
