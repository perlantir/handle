import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-scope-default-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-scope-default-"));
const workspaceDir = join(root, "workspace");
const auditLogPath = join(root, "audit.log");

try {
  const backend = new LocalBackend(taskId, {
    auditLogPath,
    projectId: "project-default-smoke",
    workspaceDir,
    workspaceScope: "DEFAULT_WORKSPACE",
  });
  await backend.initialize();
  await backend.fileWrite("inside.txt", "default workspace ok\n");
  await backend.shellExec(`cd ${workspaceDir} && cat ${join(workspaceDir, "inside.txt")}`, {
    onStderr: () => {},
    onStdout: () => {},
  });

  const audit = (await fs.readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  if (!audit.every((entry) => entry.projectId === "project-default-smoke")) {
    throw new Error("Audit entries did not include projectId");
  }
  if (!audit.every((entry) => entry.scope === "DEFAULT_WORKSPACE")) {
    throw new Error("Audit entries did not include default workspace scope");
  }
  console.log("[scope-default-workspace] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
