import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { emitTaskEvent } from "../lib/eventBus";
import { prisma } from "../lib/prisma";

export function isSmokeAgentEnabled() {
  return (
    process.env.HANDLE_SMOKE_AGENT === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function runSmokeAgent(
  taskId: string,
  goal: string,
  options: { signal?: AbortSignal } = {},
) {
  emitTaskEvent({ type: "status_update", status: "RUNNING", taskId });

  await prisma.agentRun.update({
    data: { sandboxId: "smoke-sandbox" },
    where: { id: taskId },
  });

  if (goal.includes("__HANDLE_SMOKE_HANG__")) {
    await delay(60 * 60 * 1000, undefined, { signal: options.signal });
    return;
  }

  await delay(5_000, undefined, { signal: options.signal });
  emitTaskEvent({
    type: "plan_update",
    steps: [
      {
        id: "smoke-plan-1",
        state: "pending",
        title: "Create a smoke artifact",
      },
      { id: "smoke-plan-2", state: "pending", title: "Emit a tool call" },
      {
        id: "smoke-plan-3",
        state: "pending",
        title: "Finish with a terminal status",
      },
    ],
    taskId,
  });

  await delay(500, undefined, { signal: options.signal });
  const callId = randomUUID();
  emitTaskEvent({
    type: "tool_call",
    args: { contentLength: goal.length, path: "/tmp/handle-smoke-task.json" },
    callId,
    taskId,
    toolName: "file.write",
  });

  await delay(150, undefined, { signal: options.signal });
  emitTaskEvent({
    type: "tool_stream",
    callId,
    channel: "stdout",
    content: "writing /tmp/handle-smoke-task.json\n",
    taskId,
  });

  await delay(150, undefined, { signal: options.signal });
  emitTaskEvent({
    type: "tool_result",
    callId,
    result: "Wrote smoke task artifact to /tmp/handle-smoke-task.json",
    taskId,
  });

  const finalMessage = "Smoke task completed and emitted a tool call.";

  const run = await prisma.agentRun.findUnique({
    select: { conversationId: true },
    where: { id: taskId },
  });
  if (!run) throw new Error("Smoke agent run not found");

  await prisma.message.create({
    data: {
      agentRunId: taskId,
      content: finalMessage,
      conversationId: run.conversationId,
      role: "ASSISTANT",
    },
  });
  await prisma.agentRun.update({
    data: { completedAt: new Date(), result: finalMessage, status: "COMPLETED" },
    where: { id: taskId },
  });

  emitTaskEvent({
    type: "message",
    role: "assistant",
    content: finalMessage,
    taskId,
  });
  emitTaskEvent({ type: "status_update", status: "STOPPED", taskId });
}
