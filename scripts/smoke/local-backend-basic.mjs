import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-local-basic-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-local-basic-"));
const workspaceDir = join(root, "workspace");

try {
  const backend = new LocalBackend(taskId, {
    requestApproval: async () => "approved",
    workspaceDir,
  });
  console.log(`[local-backend-basic] workspace ${workspaceDir}`);

  await backend.initialize(taskId);
  await backend.fileWrite("hello.txt", "hello from local backend\n");
  const content = await backend.fileRead("hello.txt");
  if (content !== "hello from local backend\n") {
    throw new Error(`Unexpected file content: ${JSON.stringify(content)}`);
  }

  const entries = await backend.fileList(".");
  if (!entries.some((entry) => entry.name === "hello.txt" && !entry.isDir && entry.size > 0)) {
    throw new Error(`Expected hello.txt in listing; got ${JSON.stringify(entries)}`);
  }

  await backend.fileDelete("hello.txt");
  try {
    await fs.readFile(join(workspaceDir, "hello.txt"), "utf8");
    throw new Error("Deleted file still exists");
  } catch (err) {
    if (!(err instanceof Error) || !("code" in err) || err.code !== "ENOENT") {
      throw err;
    }
  }

  await backend.shutdown(taskId);
  console.log("[local-backend-basic] PASS");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
