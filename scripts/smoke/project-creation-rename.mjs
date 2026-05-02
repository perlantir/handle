import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });
const { prisma } = await import("../../apps/api/src/lib/prisma");

const suffix = Date.now();
const project = await prisma.project.create({
  data: {
    browserMode: "SEPARATE_PROFILE",
    defaultBackend: "LOCAL",
    name: `Smoke Rename ${suffix}`,
    workspaceScope: "DEFAULT_WORKSPACE",
  },
});

try {
  const renamed = await prisma.project.update({
    data: { name: `Smoke Renamed ${suffix}` },
    where: { id: project.id },
  });

  const loaded = await prisma.project.findUnique({ where: { id: project.id } });
  if (!loaded) throw new Error("Project was not persisted");
  if (loaded.name !== renamed.name) throw new Error("Project rename did not persist");

  console.log("[project-creation-rename] PASS");
} finally {
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
