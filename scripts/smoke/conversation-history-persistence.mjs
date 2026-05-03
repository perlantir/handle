import { config as loadDotenv } from "dotenv";

const ROOT = new URL("../..", import.meta.url);
loadDotenv({ path: new URL(".env", ROOT) });
const { prisma } = await import("../../apps/api/src/lib/prisma");

const suffix = Date.now();
const project = await prisma.project.create({
  data: { name: `Smoke History ${suffix}` },
});

try {
  const conversation = await prisma.conversation.create({
    data: {
      messages: {
        create: [
          { content: "Remember this sentence", role: "USER" },
          { content: "I remember it.", role: "ASSISTANT" },
        ],
      },
      projectId: project.id,
      title: "Smoke history",
    },
  });
  const run = await prisma.agentRun.create({
    data: {
      backend: "LOCAL",
      conversationId: conversation.id,
      goal: "Remember this sentence",
      status: "COMPLETED",
    },
  });

  const conversations = await prisma.conversation.findMany({
    include: {
      agentRuns: {
        orderBy: { startedAt: "desc" },
        select: { id: true },
        take: 1,
      },
    },
    where: { projectId: project.id },
  });
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "asc" },
    where: { conversationId: conversation.id },
  });

  if (conversations[0]?.id !== conversation.id) throw new Error("Conversation did not reload for project");
  if (conversations[0]?.agentRuns[0]?.id !== run.id) throw new Error("Latest run id was not available");
  if (messages.length !== 2) throw new Error("Conversation messages did not persist");

  console.log("[conversation-history-persistence] PASS");
} finally {
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
