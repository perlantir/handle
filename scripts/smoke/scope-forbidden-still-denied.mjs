import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-scope-forbidden-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-scope-forbidden-"));
const workspaceDir = join(root, "workspace");
const auditLogPath = join(root, "audit.log");

try {
  const backend = new LocalBackend(taskId, {
    auditLogPath,
    permissionMode: "FULL_ACCESS",
    projectId: "project-forbidden-smoke",
    workspaceDir,
    workspaceScope: "DEFAULT_WORKSPACE",
  });
  await backend.initialize();
  await backend.fileWrite("/System/handle-should-never-write.txt", "nope").then(
    () => {
      throw new Error("Expected /System write to be denied");
    },
    (error) => {
      if (!(error instanceof Error) || !error.message.includes("/System")) throw error;
    },
  );

  const audit = (await fs.readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  if (!audit.some((entry) => entry.decision === "deny" && entry.matchedPattern === "/System")) {
    throw new Error("Expected /System deny audit entry");
  }
  console.log("[scope-forbidden-still-denied] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
