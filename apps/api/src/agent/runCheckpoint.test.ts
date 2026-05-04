import { describe, expect, it, vi } from "vitest";
import { latestCheckpointContext } from "./runCheckpoint";

describe("run checkpoint resume context", () => {
  it("warns resumed agents to verify partial output before completion", async () => {
    const store = {
      agentRunCheckpoint: {
        findFirst: vi.fn().mockResolvedValue({
          state: {
            goal: "Run echo 'step N' for N from 1 to 30, with sleep 1 between each",
            lastSteps: [
              {
                durationMs: 5000,
                status: "tool_error",
                step: 1,
                subgoal: "Run all 30 echo steps",
                toolInput: {
                  command: "for i in {1..30}; do echo step $i; sleep 1; done",
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
        }),
      },
    };

    const context = await latestCheckpointContext({
      runId: "run-resume",
      store,
    });

    expect(context).toContain("<resumption>");
    expect(context).toContain("Original goal: Run echo");
    expect(context).toContain("incomplete or failed tool step");
    expect(context).toContain("Partial output is not completion");
    expect(context).toContain("first missing step");
    expect(context).toContain("step 5");
  });
});
