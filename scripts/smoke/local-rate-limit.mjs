import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const taskId = `smoke-local-rate-${Date.now()}`;
const root = await fs.mkdtemp(join(tmpdir(), "handle-local-rate-"));
const workspaceDir = join(root, "workspace");

try {
  const backend = new LocalBackend(taskId, { workspaceDir });
  await backend.initialize(taskId);

  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, index) =>
      backend.shellExec(`echo rate-${index}`, {
        onStderr: () => {},
        onStdout: () => {},
      }),
    ),
  );

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  const rateLimited = rejected.filter((result) =>
    String(result.reason?.message ?? result.reason).includes("Shell execution rate limit exceeded"),
  );

  if (fulfilled.length !== 10) {
    throw new Error(`Expected exactly 10 shell executions before rate limit, got ${fulfilled.length}`);
  }
  if (rateLimited.length !== 40) {
    throw new Error(`Expected 40 rate-limited shell executions, got ${rateLimited.length}`);
  }

  console.log("[local-rate-limit] PASS 10 executed, 40 rate-limited");
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
