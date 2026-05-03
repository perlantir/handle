import { describe, expect, it, vi } from "vitest";
import {
  completeTrajectory,
  initializeTrajectory,
  normalizeSteps,
  recordTrajectoryStep,
} from "./trajectoryMemory";

describe("trajectoryMemory", () => {
  it("initializes, appends redacted steps, and completes a trajectory", async () => {
    const openAiShapedKey = `sk-${"a".repeat(30)}`;
    let trajectory: { steps?: unknown; outcome?: string; outcomeMetrics?: unknown } = {
      steps: [],
    };
    const store = {
      agentRunTrajectory: {
        findUnique: vi.fn(async () => trajectory),
        update: vi.fn(async ({ data }) => {
          trajectory = { ...trajectory, ...data };
          return trajectory;
        }),
        upsert: vi.fn(async ({ create }) => {
          trajectory = create;
          return trajectory;
        }),
      },
    };

    await initializeTrajectory({
      agentRunId: "run-trajectory",
      goal: `Create a file with ${openAiShapedKey}`,
      store,
    });
    await recordTrajectoryStep({
      agentRunId: "run-trajectory",
      step: {
        durationMs: 12,
        status: "success",
        subgoal: "Write file",
        toolInput: { content: `token ${openAiShapedKey}` },
        toolName: "file_write",
        toolOutput: "ok",
      },
      store,
    });
    await completeTrajectory({
      agentRunId: "run-trajectory",
      outcome: "SUCCEEDED",
      store,
    });

    const steps = normalizeSteps(trajectory.steps);
    expect(steps).toHaveLength(1);
    expect(JSON.stringify(steps)).toContain("[REDACTED]");
    expect(trajectory).toMatchObject({
      outcome: "SUCCEEDED",
      outcomeMetrics: {
        failedToolCalls: 0,
        totalDurationMs: 12,
        totalToolCalls: 1,
      },
    });
  });
});
