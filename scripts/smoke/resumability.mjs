#!/usr/bin/env node
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });

const { pauseAgentRunById } = await import("../../apps/api/src/agent/pauseAgentRun.ts");
const { resumeAgentRunById } = await import("../../apps/api/src/agent/resumeAgentRun.ts");
const { beginAgentRun } = await import("../../apps/api/src/agent/runControl.ts");
const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const {
  initializeTrajectory,
  recordTrajectoryStep,
} = await import("../../apps/api/src/memory/trajectoryMemory.ts");
const { latestCheckpointContext } = await import("../../apps/api/src/agent/runCheckpoint.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = await prisma.project.create({
  data: { id: `resume-project-${suffix}`, name: `Resumability Smoke ${suffix}` },
});
const conversation = await prisma.conversation.create({
  data: { projectId: project.id, title: "Pause and resume smoke" },
});
const run = await prisma.agentRun.create({
  data: {
    backend: "LOCAL",
    conversationId: conversation.id,
    goal: "Run a long task with checkpoints",
    status: "RUNNING",
  },
});

await initializeTrajectory({ agentRunId: run.id, goal: run.goal });
await recordTrajectoryStep({
  agentRunId: run.id,
  step: {
    durationMs: 5,
    status: "success",
    subgoal: "Completed first unit of work",
    toolInput: { command: "echo 1" },
    toolName: "shell_exec",
    toolOutput: "1",
  },
});

const shutdowns = [];
const control = beginAgentRun(run.id);
control.setBackend({
  browserSession: async () => {
    throw new Error("not used");
  },
  createSandbox: async () => ({}),
  fileDelete: async () => "not used",
  fileList: async () => [],
  fileRead: async () => "not used",
  fileWrite: async () => "not used",
  id: "local",
  shellExec: async () => ({ exitCode: 0 }),
  shutdown: async (taskId) => {
    shutdowns.push(taskId);
  },
});

const resumeCalls = [];

console.log("[resumability] pausing active run");
const pauseResult = await pauseAgentRunById({
  reason: "Smoke pause",
  runId: run.id,
  store: prisma,
});
assert(pauseResult.paused === true, "Pause helper did not report paused");
assert(pauseResult.active === true, "Pause did not hit active run control");
assert(shutdowns.includes(run.id), "Pause did not shut down active backend");
control.unregister();

const pausedRun = await prisma.agentRun.findUnique({ where: { id: run.id } });
assert(pausedRun?.status === "PAUSED", `Expected PAUSED, got ${pausedRun?.status}`);
const checkpoint = await prisma.agentRunCheckpoint.findFirst({ where: { agentRunId: run.id } });
assert(checkpoint, "Expected checkpoint after pause");
const checkpointContext = await latestCheckpointContext({ runId: run.id, store: prisma });
assert(checkpointContext.includes("<resume_checkpoint>"), "Checkpoint prompt context missing");

console.log("[resumability] resuming paused run");
const resumeResult = await resumeAgentRunById({
  runAgent: async (runId, goal, options) => {
    resumeCalls.push({ goal, options, runId });
  },
  runId: run.id,
  store: prisma,
});
assert(resumeResult.resumed === true, "Resume helper did not report resumed");
assert(resumeCalls.length === 1, `Expected 1 resume call, got ${resumeCalls.length}`);
assert(resumeCalls[0]?.options?.backend === "local", "Resume did not preserve local backend");
const resumedRun = await prisma.agentRun.findUnique({ where: { id: run.id } });
assert(resumedRun?.status === "RUNNING", `Expected RUNNING after resume, got ${resumedRun?.status}`);

console.log("[resumability] PASS");
