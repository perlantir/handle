import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AgentRunCancelStore } from "../agent/cancelAgentRun";
import { createAgentRunsRouter } from "./agentRuns";

function createApp(store: AgentRunCancelStore) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createAgentRunsRouter({
      getUserId: () => "user-test",
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
});
