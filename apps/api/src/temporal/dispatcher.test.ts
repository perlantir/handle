import { describe, expect, it, vi } from "vitest";
import { createAgentRunDispatcher } from "./dispatcher";

function store(enabled = true) {
  const updates: unknown[] = [];
  return {
    updates,
    agentRun: {
      update: vi.fn(async (args: unknown) => {
        updates.push(args);
      }),
    },
    temporalSettings: {
      upsert: vi.fn(async () => ({
        address: "127.0.0.1:7233",
        enabled,
        namespace: "default",
        taskQueue: "handle-agent-runs",
      })),
    },
  };
}

describe("Temporal agent run dispatcher", () => {
  it("queues enabled agent runs on Temporal", async () => {
    const routeStore = store(true);
    const start = vi.fn(async () => ({
      firstExecutionRunId: "temporal-run-1",
    }));
    const dispatch = createAgentRunDispatcher({
      createClient: vi.fn(async () => ({ workflow: { start } }) as never),
      runAgent: vi.fn(),
      store: routeStore,
    });

    await expect(
      dispatch("run-1", "do async work", { backend: "local" }),
    ).resolves.toEqual({
      mode: "temporal",
      workflowId: "handle-agent-run-run-1",
    });
    expect(start).toHaveBeenCalledWith("agentRunWorkflow", expect.objectContaining({
      taskQueue: "handle-agent-runs",
      workflowId: "handle-agent-run-run-1",
    }));
    expect(routeStore.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        asyncMode: true,
        status: "QUEUED",
        workflowRunId: "temporal-run-1",
      }),
      where: { id: "run-1" },
    });
  });

  it("falls back to inline execution when Temporal is unavailable", async () => {
    const routeStore = store(true);
    const runAgent = vi.fn(async () => undefined);
    const dispatch = createAgentRunDispatcher({
      createClient: vi.fn(async () => {
        throw new Error("Temporal down");
      }),
      runAgent,
      store: routeStore,
    });

    await expect(dispatch("run-2", "do work")).resolves.toEqual({
      mode: "inline",
    });
    expect(runAgent).toHaveBeenCalledWith("run-2", "do work", {});
    expect(routeStore.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        asyncMode: false,
        workflowStatus: "fallback_inline",
      }),
      where: { id: "run-2" },
    });
  });

  it("runs inline when Temporal is disabled", async () => {
    const routeStore = store(false);
    const runAgent = vi.fn(async () => undefined);
    const dispatch = createAgentRunDispatcher({
      createClient: vi.fn(),
      runAgent,
      store: routeStore,
    });

    await expect(dispatch("run-3", "do work")).resolves.toEqual({
      mode: "inline",
    });
    expect(runAgent).toHaveBeenCalledWith("run-3", "do work", {});
  });
});
