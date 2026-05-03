import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter } from "./memory";

function createApp(zepClient: NonNullable<Parameters<typeof createMemoryRouter>[0]>["zepClient"]) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createMemoryRouter({
      getUserId: () => "user-test",
      zepClient,
    }),
  );
  return app;
}

describe("memory route", () => {
  it("lists memory facts from global and project sessions", async () => {
    const zepClient = {
      checkConnection: vi.fn().mockResolvedValue({
        provider: "self-hosted",
        status: "online",
      }),
      deleteSessionMemory: vi.fn(),
      getSessionMemory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            content: "Favorite color is teal",
            metadata: { role: "USER" },
            role: "user",
          },
        ],
      }),
      listSessions: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          { sessionId: "global_handle-local-user" },
          { sessionId: "project_project-1" },
          { sessionId: "conv_conversation-1" },
        ],
      }),
    };

    const response = await request(createApp(zepClient as never))
      .get("/api/memory/facts")
      .expect(200);

    expect(response.body.facts).toEqual([
      expect.objectContaining({
        content: "Favorite color is teal",
        source: "global",
      }),
      expect.objectContaining({
        content: "Favorite color is teal",
        source: "project",
      }),
    ]);
  });

  it("deletes a memory namespace", async () => {
    const zepClient = {
      checkConnection: vi.fn(),
      deleteSessionMemory: vi.fn().mockResolvedValue({ ok: true }),
      getSessionMemory: vi.fn(),
      listSessions: vi.fn(),
    };

    await request(createApp(zepClient as never))
      .delete("/api/memory/facts/project_project-1")
      .expect(200);

    expect(zepClient.deleteSessionMemory).toHaveBeenCalledWith({
      sessionId: "project_project-1",
    });
  });
});
