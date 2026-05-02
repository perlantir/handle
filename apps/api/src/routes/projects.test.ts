import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createProjectsRouter, type ProjectRouteStore } from "./projects";

function createStore(): ProjectRouteStore {
  return {
    agentRun: {
      create: vi.fn().mockResolvedValue({ id: "run-test" }),
      findFirst: vi.fn().mockResolvedValue({ id: "run-test" }),
    },
    conversation: {
      create: vi.fn().mockResolvedValue({ id: "conversation-test" }),
      findFirst: vi.fn().mockResolvedValue({
        id: "conversation-test",
        project: { defaultBackend: "LOCAL" },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "message-test" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      create: vi.fn().mockResolvedValue({ id: "project-new", name: "Work" }),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ id: "default-project", name: "Personal" }]),
      findUnique: vi.fn().mockResolvedValue({ id: "default-project", name: "Personal" }),
      update: vi.fn().mockResolvedValue({ id: "default-project", name: "Renamed" }),
      upsert: vi.fn().mockResolvedValue({ id: "default-project", name: "Personal" }),
    },
  };
}

function createApp(store: ProjectRouteStore, runAgent = vi.fn().mockResolvedValue(undefined)) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createProjectsRouter({
      getUserId: () => "user-test",
      runAgent,
      store,
    }),
  );
  return { app, runAgent };
}

describe("projects routes", () => {
  it("lists projects and ensures the default Personal project exists", async () => {
    const store = createStore();
    const { app } = createApp(store);

    const response = await request(app).get("/api/projects").expect(200);

    expect(response.body.projects).toEqual([{ id: "default-project", name: "Personal" }]);
    expect(store.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: "default-project", name: "Personal" }),
      }),
    );
  });

  it("creates and updates project scope defaults", async () => {
    const store = createStore();
    const { app } = createApp(store);

    await request(app)
      .post("/api/projects")
      .send({
        customScopePath: "/Users/perlantir/Projects/handle",
        defaultBackend: "LOCAL",
        name: "Handle",
        workspaceScope: "CUSTOM_FOLDER",
      })
      .expect(201);
    expect(store.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defaultBackend: "LOCAL",
        name: "Handle",
        workspaceScope: "CUSTOM_FOLDER",
      }),
    });

    await request(app)
      .put("/api/projects/default-project")
      .send({ name: "Renamed", workspaceScope: "FULL_ACCESS" })
      .expect(200);
    expect(store.project.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Renamed", workspaceScope: "FULL_ACCESS" }),
      where: { id: "default-project" },
    });
  });

  it("creates a conversation message, agent run, and starts the agent", async () => {
    const store = createStore();
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const { app } = createApp(store, runAgent);

    const response = await request(app)
      .post("/api/conversations/conversation-test/messages")
      .send({
        backend: "local",
        content: "Continue the work",
        modelName: "claude-opus-4-7",
        providerId: "anthropic",
      })
      .expect(200);

    expect(response.body).toEqual({
      agentRunId: "run-test",
      conversationId: "conversation-test",
      messageId: "message-test",
    });
    expect(store.message.create).toHaveBeenCalledWith({
      data: {
        content: "Continue the work",
        conversationId: "conversation-test",
        role: "USER",
      },
    });
    expect(store.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        backend: "LOCAL",
        conversationId: "conversation-test",
        goal: "Continue the work",
        modelName: "claude-opus-4-7",
        providerId: "anthropic",
      }),
    });
    expect(runAgent).toHaveBeenCalledWith("run-test", "Continue the work", {
      backend: "local",
      providerOverride: "anthropic",
    });
  });
});
