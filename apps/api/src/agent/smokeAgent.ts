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

export async function runSmokeAgent(taskId: string, goal: string) {
  emitTaskEvent({ type: "status_update", status: "RUNNING", taskId });

  await prisma.task.update({
    data: { sandboxId: "smoke-sandbox" },
    where: { id: taskId },
  });

  await delay(1_500);
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

  await delay(500);
  const callId = randomUUID();
  emitTaskEvent({
    type: "tool_call",
    args: { contentLength: goal.length, path: "/tmp/handle-smoke-task.json" },
    callId,
    taskId,
    toolName: "file.write",
  });

  await delay(150);
  emitTaskEvent({
    type: "tool_stream",
    callId,
    channel: "stdout",
    content: "writing /tmp/handle-smoke-task.json\n",
    taskId,
  });

  await delay(150);
  emitTaskEvent({
    type: "tool_result",
    callId,
    result: "Wrote smoke task artifact to /tmp/handle-smoke-task.json",
    taskId,
  });

  const finalMessage = "Smoke task completed and emitted a tool call.";

  await prisma.message.create({
    data: { content: finalMessage, role: "ASSISTANT", taskId },
  });
  await prisma.task.update({
    data: { status: "STOPPED" },
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
