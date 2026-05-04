import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendActionLog } from "../lib/actionLog";
import { createActionsRouter } from "./actions";

const originalLogDir = process.env.HANDLE_LOG_DIR;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createActionsRouter({ getUserId: () => "user-test" }));
  return app;
}

describe("actions route", () => {
  beforeEach(async () => {
    process.env.HANDLE_LOG_DIR = await mkdtemp(join(tmpdir(), "handle-actions-route-test-"));
  });

  afterEach(() => {
    if (originalLogDir === undefined) {
      delete process.env.HANDLE_LOG_DIR;
    } else {
      process.env.HANDLE_LOG_DIR = originalLogDir;
    }
  });

  it("lists and filters action log entries", async () => {
    await appendActionLog({
      conversationId: "conversation-1",
      description: "Created file",
      metadata: {},
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: false,
      target: "/tmp/file.txt",
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
    });
    await appendActionLog({
      conversationId: "conversation-2",
      description: "Ran command",
      metadata: {},
      outcomeType: "shell_command_executed",
      projectId: "project-2",
      reversible: false,
      target: "echo ok",
      taskId: "run-2",
      timestamp: "2026-05-02T12:01:00.000Z",
    });

    const response = await request(createApp())
      .get("/api/actions?projectId=project-1")
      .expect(200);

    expect(response.body.actions).toHaveLength(1);
    expect(response.body.actions[0]).toMatchObject({
      outcomeType: "file_created",
      projectId: "project-1",
    });
  });

  it("undoes a reversible file-created entry", async () => {
    const file = join(process.env.HANDLE_LOG_DIR ?? tmpdir(), "created.txt");
    await writeFile(file, "hello", "utf8");
    await appendActionLog({
      conversationId: "conversation-1",
      description: `Created file ${file}`,
      metadata: {},
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: true,
      target: file,
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
      undoCommand: `rm '${file}'`,
    });

    const response = await request(createApp())
      .post("/api/actions/0/undo")
      .expect(200);

    expect(response.body).toEqual({ undone: true });
  });
});
