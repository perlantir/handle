import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ProviderId } from "../providers/types";
import { createTasksRouter, type TaskRouteStore } from "./tasks";

function createApp(
  store: TaskRouteStore,
  runAgent: (
    taskId: string,
    goal: string,
    options?: { backend?: "e2b" | "local"; providerOverride?: ProviderId },
  ) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/tasks",
    createTasksRouter({ getUserId: () => "user-test", runAgent, store }),
  );
  return app;
}

describe("tasks route", () => {
  it("creates a task and starts the agent", async () => {
    const runAgent = vi
      .fn<
        Parameters<(taskId: string, goal: string) => Promise<void>>,
        Promise<void>
      >()
      .mockResolvedValue();
    const upsertUser = vi.fn().mockResolvedValue({});
    const store: TaskRouteStore = {
      task: {
        async create() {
          return { id: "task-test" };
        },
        async findFirst() {
          return null;
        },
      },
      user: {
        upsert: upsertUser,
      },
    };

    const response = await request(createApp(store, runAgent))
      .post("/api/tasks")
      .send({ goal: "Write a file" })
      .expect(200);

    expect(response.body).toEqual({ taskId: "task-test" });
    expect(upsertUser).toHaveBeenCalledWith({
      create: { email: "user-test@handle.local", id: "user-test" },
      update: {},
      where: { id: "user-test" },
    });
    expect(runAgent).toHaveBeenCalledWith("task-test", "Write a file", {
      backend: "e2b",
    });
  });

  it("persists and forwards a backend override", async () => {
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const createTask = vi.fn().mockResolvedValue({ id: "task-local" });
    const store: TaskRouteStore = {
      task: {
        create: createTask,
        async findFirst() {
          return null;
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    await request(createApp(store, runAgent))
      .post("/api/tasks")
      .send({ backend: "local", goal: "Use local backend" })
      .expect(200);

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ backend: "local" }),
      }),
    );
    expect(runAgent).toHaveBeenCalledWith(
      "task-local",
      "Use local backend",
      {
        backend: "local",
      },
    );
  });

  it("uses the saved default execution backend when no override is provided", async () => {
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const createTask = vi.fn().mockResolvedValue({ id: "task-default-local" });
    const store: TaskRouteStore = {
      executionSettings: {
        upsert: vi.fn().mockResolvedValue({ defaultBackend: "local" }),
      },
      task: {
        create: createTask,
        async findFirst() {
          return null;
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    await request(createApp(store, runAgent))
      .post("/api/tasks")
      .send({ goal: "Use settings default" })
      .expect(200);

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ backend: "local" }),
      }),
    );
    expect(runAgent).toHaveBeenCalledWith(
      "task-default-local",
      "Use settings default",
      { backend: "local" },
    );
  });

  it("persists and forwards a provider override", async () => {
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const createTask = vi.fn().mockResolvedValue({ id: "task-provider" });
    const store: TaskRouteStore = {
      task: {
        create: createTask,
        async findFirst() {
          return null;
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    await request(createApp(store, runAgent))
      .post("/api/tasks")
      .send({ goal: "Use Anthropic", providerOverride: "anthropic" })
      .expect(200);

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerOverride: "anthropic" }),
      }),
    );
    expect(runAgent).toHaveBeenCalledWith("task-provider", "Use Anthropic", {
      backend: "e2b",
      providerOverride: "anthropic",
    });
  });

  it("can skip agent startup for smoke task creation outside production", async () => {
    const runAgent = vi
      .fn<
        Parameters<(taskId: string, goal: string) => Promise<void>>,
        Promise<void>
      >()
      .mockResolvedValue();
    const store: TaskRouteStore = {
      task: {
        async create() {
          return { id: "task-smoke" };
        },
        async findFirst() {
          return null;
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    const response = await request(createApp(store, runAgent))
      .post("/api/tasks")
      .send({ goal: "Smoke task", skipAgent: true })
      .expect(200);

    expect(response.body).toEqual({ taskId: "task-smoke" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("returns a task owned by the current user", async () => {
    const store: TaskRouteStore = {
      task: {
        async create() {
          return { id: "unused" };
        },
        async findFirst() {
          return { id: "task-test", goal: "Goal", messages: [] };
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    const response = await request(createApp(store, async () => {}))
      .get("/api/tasks/task-test")
      .expect(200);

    expect(response.body).toMatchObject({ id: "task-test", goal: "Goal" });
  });
});
