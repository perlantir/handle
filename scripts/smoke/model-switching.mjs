import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });
const { prisma } = await import("../../apps/api/src/lib/prisma");

const suffix = Date.now();
const project = await prisma.project.create({
  data: { name: `Smoke Model Switch ${suffix}` },
});

try {
  const conversation = await prisma.conversation.create({
    data: {
      projectId: project.id,
      title: "Smoke model switching",
    },
  });
  const firstRun = await prisma.agentRun.create({
    data: {
      backend: "E2B",
      conversationId: conversation.id,
      goal: "Use Anthropic",
      modelName: "claude-opus-4-7",
      providerId: "anthropic",
    },
  });
  const secondRun = await prisma.agentRun.create({
    data: {
      backend: "E2B",
      conversationId: conversation.id,
      goal: "Use OpenRouter",
      modelName: "anthropic/claude-opus-4.7",
      providerId: "openrouter",
    },
  });

  const runs = await prisma.agentRun.findMany({
    orderBy: { startedAt: "asc" },
    where: { conversationId: conversation.id },
  });
  if (runs.length !== 2) throw new Error("Expected two runs in conversation");
  if (runs[0]?.id !== firstRun.id || runs[1]?.id !== secondRun.id) {
    throw new Error("Runs did not preserve order");
  }
  if (runs[0]?.providerId === runs[1]?.providerId) {
    throw new Error("Provider did not switch across runs");
  }

  console.log("[model-switching] PASS");
} finally {
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
