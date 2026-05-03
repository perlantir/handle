#!/usr/bin/env node
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });

const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const {
  completeTrajectory,
  initializeTrajectory,
  recordTrajectoryStep,
} = await import("../../apps/api/src/memory/trajectoryMemory.ts");
const {
  findSimilarFailedTrajectories,
  formatFailureMemoryContext,
} = await import("../../apps/api/src/memory/proceduralMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = await prisma.project.create({
  data: { id: `failure-project-${suffix}`, name: `Failure Smoke ${suffix}` },
});
const conversation = await prisma.conversation.create({
  data: { projectId: project.id, title: "Forbidden delete failure" },
});
const run = await prisma.agentRun.create({
  data: {
    conversationId: conversation.id,
    goal: "Delete /System/test.txt",
    result: "Safety governor denied forbidden path",
    status: "FAILED",
  },
});

console.log("[failure-memory] seeding failed trajectory");
await initializeTrajectory({ agentRunId: run.id, goal: run.goal });
await recordTrajectoryStep({
  agentRunId: run.id,
  step: {
    durationMs: 7,
    errorReason: "Safety governor denied forbidden path",
    status: "tool_error",
    subgoal: "Attempted to delete a forbidden system file",
    toolInput: { path: "/System/test.txt" },
    toolName: "file_delete",
    toolOutput: "denied",
  },
});
await completeTrajectory({
  agentRunId: run.id,
  outcome: "FAILED",
  outcomeReason: "Safety governor denied forbidden path",
});

const matches = await findSimilarFailedTrajectories({
  goal: "Delete /System/foo.txt",
  projectId: project.id,
});
assert(matches.length >= 1, `Expected at least 1 failed match, got ${matches.length}`);

const promptContext = formatFailureMemoryContext(matches);
assert(promptContext.includes("<failure_memory>"), "Failure memory prompt block missing");
assert(promptContext.includes("Safety governor denied"), "Failure root cause not referenced");
assert(promptContext.includes("Attempted to delete"), "Failure approach not referenced");

console.log("[failure-memory] PASS");
