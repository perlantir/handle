import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AgentRunCancelStore } from "../agent/cancelAgentRun";
import { createAgentRunsRouter } from "./agentRuns";

function createApp(store: AgentRunCancelStore, runAgent = vi.fn(async () => {})) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createAgentRunsRouter({
      getUserId: () => "user-test",
      runAgent,
      store,
    }),
  );
  return app;
}

describe("agent run routes", () => {
  it("marks a running agent run as cancelled", async () => {
    const store = {
      agentRun: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "run-cancel", status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const response = await request(createApp(store))
      .post("/api/agent-runs/run-cancel/cancel")
      .send({ reason: "Test cancel" })
      .expect(200);

    expect(response.body).toEqual({
      active: false,
      cancelled: true,
      status: "CANCELLED",
    });
    expect(store.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "Test cancel",
        status: "CANCELLED",
      }),
      where: { id: "run-cancel" },
    });
  });

  it("returns 404 when the run does not exist", async () => {
    const store = {
      agentRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    await request(createApp(store))
      .post("/api/agent-runs/missing/cancel")
      .send({})
      .expect(404);
  });

  it("pauses a running agent run and writes a checkpoint", async () => {
    const store = {
      agentRun: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ goal: "Long task", id: "run-pause", status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      agentRunCheckpoint: {
        create: vi.fn().mockResolvedValue({}),
      },
      agentRunTrajectory: {
        findUnique: vi.fn().mockResolvedValue({ steps: [] }),
      },
    };

    const response = await request(createApp(store))
      .post("/api/agent-runs/run-pause/pause")
      .send({ reason: "Test pause" })
      .expect(200);

    expect(response.body).toEqual({
      active: false,
      paused: true,
      status: "PAUSED",
    });
    expect(store.agentRunCheckpoint.create).toHaveBeenCalled();
    expect(store.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "Test pause",
        status: "PAUSED",
      }),
      where: { id: "run-pause" },
    });
  });

  it("resumes a paused agent run", async () => {
    const runAgent = vi.fn(async () => {});
    const store = {
      agentRun: {
        findFirst: vi.fn().mockResolvedValue({
          backend: "LOCAL",
          goal: "Resume this task",
          id: "run-resume",
          providerId: "openai",
          status: "PAUSED",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const response = await request(createApp(store, runAgent))
      .post("/api/agent-runs/run-resume/resume")
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      resumed: true,
      status: "RUNNING",
    });
    expect(store.agentRun.update).toHaveBeenCalledWith({
      data: { completedAt: null, result: null, status: "RUNNING" },
      where: { id: "run-resume" },
    });
    expect(runAgent).toHaveBeenCalledWith("run-resume", "Resume this task", {
      backend: "local",
      providerOverride: "openai",
    });
  });
});
