import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { LocalBackend } from "../../apps/api/src/execution/localBackend";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });
const { prisma } = await import("../../apps/api/src/lib/prisma");

const suffix = Date.now();
const root = await mkdtemp(join(tmpdir(), "handle-scope-mid-"));
const auditLogPath = join(root, "audit.log");
const workspaceDir = join(root, "workspace");
const outsidePath = join(root, "outside.txt");
const project = await prisma.project.create({
  data: {
    defaultBackend: "LOCAL",
    name: `Smoke Mid Scope ${suffix}`,
    workspaceScope: "DEFAULT_WORKSPACE",
  },
});

try {
  const firstBackend = new LocalBackend(`smoke-mid-${suffix}-a`, {
    auditLogPath,
    projectId: project.id,
    requestApproval: async () => "denied",
    workspaceDir,
    workspaceScope: "DEFAULT_WORKSPACE",
  });
  await firstBackend.initialize();
  await firstBackend.fileWrite(join(workspaceDir, "inside.txt"), "inside\n");
  await firstBackend.fileWrite(outsidePath, "outside\n").catch(() => undefined);

  await prisma.project.update({
    data: { workspaceScope: "FULL_ACCESS" },
    where: { id: project.id },
  });
  const secondBackend = new LocalBackend(`smoke-mid-${suffix}-b`, {
    auditLogPath,
    projectId: project.id,
    workspaceDir,
    workspaceScope: "FULL_ACCESS",
  });
  await secondBackend.initialize();
  await secondBackend.fileWrite(outsidePath, "outside allowed\n");

  const audit = (await readFile(auditLogPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!audit.some((entry) => entry.scope === "DEFAULT_WORKSPACE" && entry.decision === "allow")) {
    throw new Error("Default workspace write was not allowed");
  }
  if (!audit.some((entry) => entry.scope === "FULL_ACCESS" && entry.target === outsidePath && entry.decision === "allow")) {
    throw new Error("Full access write did not apply after scope change");
  }

  console.log("[scope-mid-project-change] PASS");
} finally {
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
  await rm(root, { force: true, recursive: true }).catch(() => undefined);
}
