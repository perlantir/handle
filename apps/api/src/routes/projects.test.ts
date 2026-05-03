import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createProjectsRouter, type ProjectRouteStore } from "./projects";

function createStore(): ProjectRouteStore {
  return {
    agentRun: {
      create: vi.fn().mockResolvedValue({ id: "run-test" }),
      findFirst: vi.fn().mockResolvedValue({ id: "run-test" }),
      update: vi.fn().mockResolvedValue({ id: "run-test" }),
    },
    conversation: {
      create: vi.fn().mockResolvedValue({ id: "conversation-test" }),
      delete: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({
        id: "conversation-test",
        project: { defaultBackend: "LOCAL" },
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "conversation-test", title: "Renamed chat" }),
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
        customScopePath: process.cwd(),
        defaultBackend: "LOCAL",
        name: "Handle",
        permissionMode: "ASK",
        workspaceScope: "CUSTOM_FOLDER",
      })
      .expect(201);
    expect(store.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customScopePath: process.cwd(),
        defaultBackend: "LOCAL",
        name: "Handle",
        permissionMode: "ASK",
        workspaceScope: "CUSTOM_FOLDER",
      }),
    });

    await request(app)
      .put("/api/projects/default-project")
      .send({ name: "Renamed", permissionMode: "FULL_ACCESS", workspaceScope: "DESKTOP" })
      .expect(200);
    expect(store.project.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customScopePath: null,
        name: "Renamed",
        permissionMode: "FULL_ACCESS",
        workspaceScope: "DESKTOP",
      }),
      where: { id: "default-project" },
    });
  });

  it("rejects missing specific folder paths and accepts Desktop scope", async () => {
    const store = createStore();
    const { app } = createApp(store);

    await request(app)
      .put("/api/projects/default-project")
      .send({ workspaceScope: "CUSTOM_FOLDER" })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toMatch(/Specific folder path/);
      });

    await request(app)
      .put("/api/projects/default-project")
      .send({ workspaceScope: "DESKTOP" })
      .expect(200);
    expect(store.project.update).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        customScopePath: null,
        workspaceScope: "DESKTOP",
      }),
      where: { id: "default-project" },
    });
  });

  it("creates a conversation message, agent run, and starts the agent", async () => {
    const store = createStore();
    vi.mocked(store.agentRun.findFirst).mockResolvedValueOnce(null);
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

  it("cancels an active run before starting an interrupting follow-up", async () => {
    const store = createStore();
    vi.mocked(store.agentRun.findFirst).mockResolvedValueOnce({
      id: "run-active",
      status: "RUNNING",
    });
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const { app } = createApp(store, runAgent);

    const response = await request(app)
      .post("/api/conversations/conversation-test/messages")
      .send({ content: "Actually do this instead" })
      .expect(200);

    expect(response.body.cancelledRunId).toBe("run-active");
    expect(store.agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "Interrupted by a follow-up message",
        status: "CANCELLED",
      }),
      where: { id: "run-active" },
    });
    expect(runAgent).toHaveBeenCalledWith("run-test", "Actually do this instead", {
      backend: "local",
    });
  });

  it("lists conversations with latest agent run ids for sidebar history", async () => {
    const store = createStore();
    vi.mocked(store.conversation.findMany).mockResolvedValueOnce([
      {
        agentRuns: [{ id: "run-latest" }],
        id: "conversation-test",
        projectId: "project-test",
        title: "Follow-up",
      },
    ]);
    const { app } = createApp(store);

    const response = await request(app)
      .get("/api/projects/project-test/conversations")
      .expect(200);

    expect(response.body.conversations).toEqual([
      expect.objectContaining({
        id: "conversation-test",
        latestAgentRunId: "run-latest",
        title: "Follow-up",
      }),
    ]);
  });

  it("renames and deletes conversations for sidebar chat management", async () => {
    const store = createStore();
    const { app } = createApp(store);

    const rename = await request(app)
      .put("/api/conversations/conversation-test")
      .send({ title: "Renamed chat" })
      .expect(200);

    expect(rename.body.conversation).toEqual({ id: "conversation-test", title: "Renamed chat" });
    expect(store.conversation.update).toHaveBeenCalledWith({
      data: { title: "Renamed chat" },
      where: { id: "conversation-test" },
    });

    await request(app).delete("/api/conversations/conversation-test").expect(204);
    expect(store.conversation.delete).toHaveBeenCalledWith({
      where: { id: "conversation-test" },
    });
  });
});
