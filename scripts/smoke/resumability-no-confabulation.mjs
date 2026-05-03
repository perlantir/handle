#!/usr/bin/env node
import { latestCheckpointContext } from "../../apps/api/src/agent/runCheckpoint.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const store = {
  agentRunCheckpoint: {
    async findFirst() {
      return {
        state: {
          goal: "Run echo 'step N' for N from 1 to 30, with sleep 1 between each",
          lastSteps: [
            {
              durationMs: 5100,
              errorReason: "Paused by user",
              status: "tool_error",
              step: 1,
              subgoal: "Run requested 30-step shell loop",
              toolInput: {
                command: "for i in {1..30}; do echo \"step $i\"; sleep 1; done",
              },
              toolName: "shell_exec",
              toolOutput: {
                exitCode: 1,
                stderr: "",
                stdout: "step 1\nstep 2\nstep 3\nstep 4\nstep 5\n",
              },
            },
          ],
          stepCount: 1,
        },
        stepIndex: 1,
      };
    },
  },
};

console.log("[resumability-no-confabulation] building resume context");
const context = await latestCheckpointContext({
  runId: "resumability-no-confabulation",
  store,
});

assert(context.includes("<resumption>"), "Missing resumption marker");
assert(context.includes("original goal") || context.includes("Original goal"), "Missing original goal");
assert(context.includes("Partial output is not completion"), "Missing partial-output warning");
assert(context.includes("first missing step"), "Missing continue-from-missing-step instruction");
assert(context.includes("step 5"), "Missing partial output evidence");
assert(!context.includes("already completed"), "Resume context should not imply prior completion");

console.log("[resumability-no-confabulation] PASS");
