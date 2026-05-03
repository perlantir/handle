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
  findSimilarSuccessfulTrajectories,
  formatProceduralMemoryContext,
  synthesizeTrajectoryTemplates,
} = await import("../../apps/api/src/memory/proceduralMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedTrajectory({ goal, projectId }) {
  const conversation = await prisma.conversation.create({
    data: { projectId, title: goal.slice(0, 80) },
  });
  const run = await prisma.agentRun.create({
    data: { conversationId: conversation.id, goal, status: "COMPLETED" },
  });
  await initializeTrajectory({ agentRunId: run.id, goal });
  await recordTrajectoryStep({
    agentRunId: run.id,
    step: {
      durationMs: 10,
      status: "success",
      subgoal: "Created script.py with helper function",
      toolInput: { path: "script.py" },
      toolName: "file_write",
      toolOutput: "ok",
    },
  });
  await recordTrajectoryStep({
    agentRunId: run.id,
    step: {
      durationMs: 12,
      status: "success",
      subgoal: "Ran script with python3",
      toolInput: { command: "python3 script.py" },
      toolName: "shell_exec",
      toolOutput: "ok",
    },
  });
  await completeTrajectory({ agentRunId: run.id, outcome: "SUCCEEDED" });
  return run.id;
}

const suffix = Date.now();
const project = await prisma.project.create({
  data: { id: `procedural-project-${suffix}`, name: `Procedural Smoke ${suffix}` },
});

console.log("[procedural-memory] seeding successful trajectories");
await seedTrajectory({
  goal: "Write a Python script that prints fibonacci numbers",
  projectId: project.id,
});
await seedTrajectory({
  goal: "Write a Python script that calculates factorials",
  projectId: project.id,
});

const matches = await findSimilarSuccessfulTrajectories({
  goal: "Write a Python script that prints prime numbers",
  projectId: project.id,
});
assert(matches.length >= 2, `Expected at least 2 matches, got ${matches.length}`);
const promptContext = formatProceduralMemoryContext(matches);
assert(promptContext.includes("<procedural_memory>"), "Procedural memory prompt block missing");
assert(promptContext.includes("fibonacci") || promptContext.includes("factorials"), "Prior task not referenced");

const synthesis = await synthesizeTrajectoryTemplates({ projectId: project.id });
assert(synthesis.created >= 1, "Expected at least one synthesized template");

console.log("[procedural-memory] PASS");
