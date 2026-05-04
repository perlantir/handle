import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSavedAgentsRouter } from "./savedAgents";

function store() {
  const savedAgents = new Map<string, any>();
  const savedAgentRuns = new Map<string, any>();
  const conversations = new Map<string, any>();
  const messages = new Map<string, any>();
  const agentRuns = new Map<string, any>();
  const project = { id: "default-project", name: "Personal" };

  return {
    agentRun: {
      create: vi.fn(async (args) => {
        const run = { ...args.data, id: `run-${agentRuns.size + 1}` };
        agentRuns.set(run.id, run);
        return run;
      }),
      findUnique: vi.fn(async (args) => {
        return agentRuns.get(args.where.id) ?? null;
      }),
      update: vi.fn(async (args) => {
        const run = { ...agentRuns.get(args.where.id), ...args.data };
        agentRuns.set(args.where.id, run);
        return run;
      }),
    },
    conversation: {
      create: vi.fn(async (args) => {
        const conversation = {
          ...args.data,
          id: `conversation-${conversations.size + 1}`,
        };
        conversations.set(conversation.id, conversation);
        return conversation;
      }),
    },
    message: {
      create: vi.fn(async (args) => {
        const message = { ...args.data, id: `message-${messages.size + 1}` };
        messages.set(message.id, message);
        return message;
      }),
    },
    project: {
      upsert: vi.fn(async () => project),
    },
    savedAgent: {
      create: vi.fn(async (args) => {
        const agent = {
          ...args.data,
          id: `agent-${savedAgents.size + 1}`,
          updatedAt: new Date("2026-05-04T00:00:00.000Z"),
        };
        savedAgents.set(agent.id, agent);
        return agent;
      }),
      delete: vi.fn(async (args) => {
        savedAgents.delete(args.where.id);
      }),
      findFirst: vi.fn(async (args) => {
        return (
          Array.from(savedAgents.values()).find(
            (agent) =>
              agent.id === args.where.id &&
              (!args.where.userId || agent.userId === args.where.userId),
          ) ?? null
        );
      }),
      findMany: vi.fn(async () => Array.from(savedAgents.values())),
      update: vi.fn(async (args) => {
        const agent = { ...savedAgents.get(args.where.id), ...args.data };
        savedAgents.set(args.where.id, agent);
        return agent;
      }),
    },
    savedAgentRun: {
      create: vi.fn(async (args) => {
        const run = {
          ...args.data,
          id: `saved-run-${savedAgentRuns.size + 1}`,
        };
        savedAgentRuns.set(run.id, run);
        return run;
      }),
      update: vi.fn(async (args) => {
        const run = { ...savedAgentRuns.get(args.where.id), ...args.data };
        savedAgentRuns.set(args.where.id, run);
        return run;
      }),
    },
  };
}

function app(
  dispatchAgentRun = vi.fn(async () => ({ mode: "inline" as const })),
) {
  const routeStore = store();
  const server = express();
  server.use(express.json());
  server.use(
    "/api",
    createSavedAgentsRouter({
      dispatchAgentRun,
      getUserId: () => "user-test",
      store: routeStore as never,
    }),
  );
  return { dispatchAgentRun, routeStore, server };
}

describe("saved agents routes", () => {
  it("creates, lists, runs, and deletes saved agents", async () => {
    const { dispatchAgentRun, server } = app();
    const create = await request(server)
      .post("/api/saved-agents")
      .send({
        connectorAccess: ["gmail", "slack"],
        memoryScope: "PROJECT_ONLY",
        name: "Urgent digest",
        outputTarget: { type: "chat" },
        prompt: "Read inbox and summarize urgent messages.",
        trigger: "manual",
      });

    expect(create.status).toBe(201);
    expect(create.body.agent.name).toBe("Urgent digest");

    const list = await request(server).get("/api/saved-agents");
    expect(list.status).toBe(200);
    expect(list.body.agents).toHaveLength(1);

    const run = await request(server).post(
      `/api/saved-agents/${create.body.agent.id}/run`,
    );
    expect(run.status).toBe(200);
    expect(run.body.status).toBe("QUEUED");
    expect(dispatchAgentRun).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      "Read inbox and summarize urgent messages.",
    );

    const remove = await request(server).delete(
      `/api/saved-agents/${create.body.agent.id}`,
    );
    expect(remove.status).toBe(204);
  });

  it("syncs saved-agent run status when Temporal falls back inline", async () => {
    const routeStore = store();
    const dispatchAgentRun = vi.fn(async (runId: string) => {
      await routeStore.agentRun.update({
        data: {
          completedAt: new Date("2026-05-04T10:00:00.000Z"),
          result: "Provider unavailable",
          status: "FAILED",
        },
        where: { id: runId },
      });
      return { mode: "inline" as const };
    });
    const server = express();
    server.use(express.json());
    server.use(
      "/api",
      createSavedAgentsRouter({
        dispatchAgentRun,
        getUserId: () => "user-test",
        store: routeStore as never,
      }),
    );

    const create = await request(server)
      .post("/api/saved-agents")
      .send({
        connectorAccess: [],
        memoryScope: "NONE",
        name: "Inline fallback",
        outputTarget: { type: "chat" },
        prompt: "Summarize my inbox.",
        trigger: "manual",
      });

    const run = await request(server).post(
      `/api/saved-agents/${create.body.agent.id}/run`,
    );
    expect(run.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(routeStore.savedAgentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: "Provider unavailable",
        status: "FAILED",
      }),
      where: { id: expect.stringMatching(/^saved-run-/) },
    });
  });
});
