import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-scope-full-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-scope-full-"));
const workspaceDir = join(root, "workspace");
const outsidePath = join(root, "outside-full-access.txt");
const auditLogPath = join(root, "audit.log");

try {
  const backend = new LocalBackend(taskId, {
    auditLogPath,
    permissionMode: "FULL_ACCESS",
    projectId: "project-full-smoke",
    workspaceDir,
    workspaceScope: "DEFAULT_WORKSPACE",
  });
  await backend.initialize();
  await backend.fileWrite(outsidePath, "full access ok\n");
  const content = await fs.readFile(outsidePath, "utf8");
  if (!content.includes("full access ok")) throw new Error("Full access write failed");

  const audit = (await fs.readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  if (!audit.some((entry) => entry.permissionMode === "FULL_ACCESS" && entry.decision === "allow")) {
    throw new Error("Expected full access allow audit entry");
  }
  console.log("[scope-full-access] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
