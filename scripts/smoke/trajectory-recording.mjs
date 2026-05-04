#!/usr/bin/env node
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });

const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const {
  completeTrajectory,
  initializeTrajectory,
  recordTrajectoryStep,
} = await import("../../apps/api/src/memory/trajectoryMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = await prisma.project.create({
  data: {
    id: `trajectory-project-${suffix}`,
    name: `Trajectory Smoke ${suffix}`,
  },
});
const conversation = await prisma.conversation.create({
  data: {
    projectId: project.id,
    title: "Trajectory smoke",
  },
});
const run = await prisma.agentRun.create({
  data: {
    conversationId: conversation.id,
    goal: "Write a Python script that prints hello",
    status: "RUNNING",
  },
});

console.log(`[trajectory-recording] created run ${run.id}`);
await initializeTrajectory({
  agentRunId: run.id,
  goal: run.goal,
});
await recordTrajectoryStep({
  agentRunId: run.id,
  step: {
    durationMs: 25,
    status: "success",
    subgoal: "Create script file",
    toolInput: { path: "/home/user/hello.py" },
    toolName: "file_write",
    toolOutput: "Wrote 21 bytes to /home/user/hello.py",
  },
});
await completeTrajectory({
  agentRunId: run.id,
  outcome: "SUCCEEDED",
});

const trajectory = await prisma.agentRunTrajectory.findUnique({
  where: { agentRunId: run.id },
});
assert(trajectory, "Trajectory was not created");
assert(trajectory.outcome === "SUCCEEDED", `Unexpected outcome ${trajectory.outcome}`);
assert(Array.isArray(trajectory.steps), "Trajectory steps are not an array");
assert(trajectory.steps.length === 1, `Expected 1 step, got ${trajectory.steps.length}`);
assert(trajectory.goalEmbedding instanceof Uint8Array, "Goal embedding was not stored");

console.log("[trajectory-recording] PASS");
