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
  listProcedureTemplates,
  synthesizeTrajectoryTemplates,
} = await import("../../apps/api/src/memory/proceduralMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedSuccessfulPythonTask({ goal, projectId }) {
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
      durationMs: 20,
      status: "success",
      subgoal: "Created a Python script file",
      toolInput: { path: "script.py" },
      toolName: "file_write",
      toolOutput: "ok",
    },
  });
  await recordTrajectoryStep({
    agentRunId: run.id,
    step: {
      durationMs: 25,
      status: "success",
      subgoal: "Ran the Python script",
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
  data: {
    id: `procedural-template-project-${suffix}`,
    name: `Procedural Template Smoke ${suffix}`,
  },
});

console.log("[procedural-template-extraction] seeding similar successful trajectories");
for (const value of ["hello", "world", "phase5"]) {
  await seedSuccessfulPythonTask({
    goal: `Write a Python script that prints '${value}' and run it`,
    projectId: project.id,
  });
}

const synthesis = await synthesizeTrajectoryTemplates({ projectId: project.id });
assert(
  synthesis.created + synthesis.updated >= 1,
  `Expected template create/update, got ${JSON.stringify(synthesis)}`,
);
assert(synthesis.threshold <= 3, `Expected practical threshold <= 3, got ${synthesis.threshold}`);

const templates = await listProcedureTemplates();
const template = templates.find(
  (item) => item.name.includes("write python script") && item.usageCount >= 3,
);
assert(
  template,
  `No extracted write-python-script template found: ${JSON.stringify(templates.slice(0, 5))}`,
);

const matches = await findSimilarSuccessfulTrajectories({
  goal: "Write a Python script that prints 'final' and run it",
  projectId: project.id,
});
assert(matches.length >= 3, `Expected 3 procedural recall matches, got ${matches.length}`);

console.log("[procedural-template-extraction] PASS");
