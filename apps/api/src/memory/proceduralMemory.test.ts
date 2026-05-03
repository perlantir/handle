import { describe, expect, it, vi } from "vitest";
import {
  findSimilarFailedTrajectories,
  findSimilarSuccessfulTrajectories,
  formatFailureMemoryContext,
  formatProceduralMemoryContext,
  synthesizeTrajectoryTemplates,
} from "./proceduralMemory";

describe("proceduralMemory", () => {
  it("retrieves similar successful trajectories and formats prompt context", async () => {
    const store = {
      agentRunTrajectory: {
        findMany: vi.fn(async () => [
          {
            agentRunId: "run-fib",
            goal: "Write a Python script that prints fibonacci numbers",
            outcome: "SUCCEEDED",
            steps: [
              {
                durationMs: 1,
                status: "success",
                step: 1,
                subgoal: "Created fib.py",
                toolInput: {},
                toolName: "file_write",
                toolOutput: "ok",
              },
            ],
          },
          {
            agentRunId: "run-unrelated",
            goal: "Open a browser",
            outcome: "SUCCEEDED",
            steps: [],
          },
        ]),
      },
    };

    const matches = await findSimilarSuccessfulTrajectories({
      goal: "Write a Python script that prints prime numbers",
      store,
    });

    expect(matches).toHaveLength(1);
    const context = formatProceduralMemoryContext(matches);
    expect(context).toContain("<procedural_memory>");
    expect(context).toContain("fibonacci");
    expect(context).toContain("Created fib.py");
  });

  it("retrieves similar failed trajectories and formats cautionary context", async () => {
    const store = {
      agentRunTrajectory: {
        findMany: vi.fn(async () => [
          {
            agentRunId: "run-system-delete",
            goal: "Delete /System/test.txt",
            outcome: "FAILED",
            outcomeReason: "Safety governor denied forbidden path",
            steps: [
              {
                durationMs: 2,
                status: "tool_error",
                step: 1,
                subgoal: "Attempted forbidden delete",
                toolInput: {},
                toolName: "file_delete",
                toolOutput: "denied",
              },
            ],
          },
        ]),
      },
    };

    const matches = await findSimilarFailedTrajectories({
      goal: "Delete /System/foo.txt",
      store,
    });

    expect(matches).toHaveLength(1);
    const context = formatFailureMemoryContext(matches);
    expect(context).toContain("<failure_memory>");
    expect(context).toContain("Safety governor denied forbidden path");
    expect(context).toContain("Attempted forbidden delete");
  });

  it("synthesizes templates from repeated successful trajectories", async () => {
    const create = vi.fn(async () => ({}));
    const store = {
      agentRunTrajectory: {
        findMany: vi.fn(async () => [
          {
            agentRunId: "run-1",
            goal: "Write Python script primes",
            steps: [{ subgoal: "write", toolName: "file_write" }],
          },
          {
            agentRunId: "run-2",
            goal: "Write Python script fibonacci",
            steps: [{ subgoal: "write", toolName: "file_write" }],
          },
        ]),
      },
      trajectoryTemplate: { create },
    };

    const result = await synthesizeTrajectoryTemplates({ store });

    expect(result.created).toBe(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: expect.stringContaining("Procedure"),
        usageCount: 2,
      }),
    });
  });
});
