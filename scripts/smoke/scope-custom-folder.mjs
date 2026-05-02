import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-scope-custom-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-scope-custom-"));
const workspaceDir = join(root, "workspace");
const customScopePath = join(root, "custom");
const auditLogPath = join(root, "audit.log");

try {
  const backend = new LocalBackend(taskId, {
    auditLogPath,
    customScopePath,
    projectId: "project-custom-smoke",
    requestApproval: async () => "denied",
    workspaceDir,
    workspaceScope: "CUSTOM_FOLDER",
  });
  await backend.initialize();
  await backend.fileWrite(join(customScopePath, "inside.txt"), "custom scope ok\n");
  await backend.fileWrite(join(workspaceDir, "outside.txt"), "outside\n").then(
    () => {
      throw new Error("Expected outside custom folder write to require approval and be denied");
    },
    (error) => {
      if (!(error instanceof Error) || !error.message.includes("User denied approval")) {
        throw error;
      }
    },
  );

  const audit = (await fs.readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  if (!audit.some((entry) => entry.scope === "CUSTOM_FOLDER" && entry.decision === "allow")) {
    throw new Error("Expected custom folder allow audit entry");
  }
  if (!audit.some((entry) => entry.matchedPattern === "outside-scope" && entry.approved === false)) {
    throw new Error("Expected outside custom folder approval audit entry");
  }
  console.log("[scope-custom-folder] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
