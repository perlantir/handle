import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowsRouter } from "./workflows";

vi.mock("../lib/actionLog", () => ({
  appendActionLog: vi.fn(async () => undefined),
}));

function store() {
  const workflows = new Map<string, any>();
  const runs = new Map<string, any>();
  return {
    workflow: {
      create: vi.fn(async (args) => {
        const workflow = { ...args.data, id: `workflow-${workflows.size + 1}` };
        workflows.set(workflow.id, workflow);
        return workflow;
      }),
      delete: vi.fn(async (args) => {
        workflows.delete(args.where.id);
      }),
      findFirst: vi.fn(async (args) => {
        return Array.from(workflows.values()).find(
          (workflow) =>
            workflow.id === args.where.id &&
            (!args.where.userId || workflow.userId === args.where.userId),
        ) ?? null;
      }),
      findMany: vi.fn(async () => Array.from(workflows.values())),
      update: vi.fn(async (args) => {
        const workflow = { ...workflows.get(args.where.id), ...args.data };
        workflows.set(args.where.id, workflow);
        return workflow;
      }),
    },
    workflowRun: {
      create: vi.fn(async (args) => {
        const run = { ...args.data, id: `run-${runs.size + 1}` };
        runs.set(run.id, run);
        return run;
      }),
      findMany: vi.fn(async () => Array.from(runs.values())),
      update: vi.fn(async (args) => {
        const run = { ...runs.get(args.where.id), ...args.data };
        runs.set(args.where.id, run);
        return run;
      }),
    },
  };
}

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api", createWorkflowsRouter({ getUserId: () => "user-test", store: store() as never }));
  return server;
}

describe("workflows routes", () => {
  it("creates, lists, and runs workflow templates", async () => {
    const server = app();
    const create = await request(server)
      .post("/api/workflows")
      .send({
        actions: [{ connectorId: "slack", params: { channel: "#releases" }, toolName: "slack.send_message" }],
        enabled: true,
        name: "Release post",
        triggerConnectorId: "github",
        triggerEventType: "pull_request.merged",
        triggerFilter: { label: "release" },
      });

    expect(create.status).toBe(201);
    expect(create.body.workflow.name).toBe("Release post");

    const list = await request(server).get("/api/workflows");
    expect(list.status).toBe(200);

    const run = await request(server)
      .post(`/api/workflows/${create.body.workflow.id}/run`)
      .send({ eventPayload: { pullRequest: 1 } });
    expect(run.status).toBe(200);
    expect(run.body.status).toBe("COMPLETED");
  });
});
