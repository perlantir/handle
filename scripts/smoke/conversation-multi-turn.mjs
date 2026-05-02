import { prisma } from "../../apps/api/src/lib/prisma";

const suffix = Date.now();
const project = await prisma.project.create({
  data: { name: `Smoke Multi Turn ${suffix}` },
});

try {
  const conversation = await prisma.conversation.create({
    data: {
      messages: {
        create: [
          { content: "Create animal.txt with otter", role: "USER" },
          { content: "Created animal.txt.", role: "ASSISTANT" },
          { content: "Now read it", role: "USER" },
        ],
      },
      projectId: project.id,
      title: "Smoke multi-turn",
    },
  });

  const run = await prisma.agentRun.create({
    data: {
      backend: "LOCAL",
      conversationId: conversation.id,
      goal: "Now read it",
      providerId: "anthropic",
      status: "RUNNING",
    },
  });

  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "asc" },
    where: { conversationId: conversation.id },
  });

  if (messages.length !== 3) throw new Error(`Expected 3 messages, got ${messages.length}`);
  if (run.conversationId !== conversation.id) throw new Error("AgentRun did not link to conversation");

  console.log("[conversation-multi-turn] PASS");
} finally {
  await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
  await prisma.$disconnect();
}
