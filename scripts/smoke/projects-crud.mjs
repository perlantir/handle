import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });
const { prisma } = await import("../../apps/api/src/lib/prisma");

const suffix = Date.now();
const projectName = `Smoke Project ${suffix}`;

const project = await prisma.project.create({
  data: {
    defaultBackend: "LOCAL",
    name: projectName,
    permissionMode: "ASK",
    workspaceScope: "DEFAULT_WORKSPACE",
  },
});

try {
  const listed = await prisma.project.findMany({
    where: { id: project.id },
  });
  if (listed.length !== 1) throw new Error("Created project was not listed");

  const updated = await prisma.project.update({
    data: { name: `${projectName} Updated`, permissionMode: "FULL_ACCESS", workspaceScope: "DESKTOP" },
    where: { id: project.id },
  });
  if (updated.permissionMode !== "FULL_ACCESS" || updated.workspaceScope !== "DESKTOP") {
    throw new Error("Project update did not persist permissionMode/workspaceScope");
  }

  await prisma.project.delete({ where: { id: project.id } });
  const deleted = await prisma.project.findUnique({ where: { id: project.id } });
  if (deleted) throw new Error("Project delete did not remove row");

  console.log("[projects-crud] PASS");
} finally {
  await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
