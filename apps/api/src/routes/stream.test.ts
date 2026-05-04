import express from "express";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamRouter } from "./stream";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
});

function listen(app: express.Express) {
  const server = createServer(app);
  servers.push(server);

  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Expected TCP server address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe("stream route", () => {
  it("reconciles persisted assistant messages and status for worker-process runs", async () => {
    let pollCount = 0;
    const findFirst = vi.fn(async (args: unknown) => {
      if (typeof args === "object" && args && "include" in args) {
        pollCount += 1;
        return pollCount === 1
          ? {
              conversation: { messages: [] },
              id: "task-test",
              status: "RUNNING",
            }
          : {
              conversation: {
                messages: [
                  {
                    content: "Worker completed the task.",
                    id: "message-assistant",
                    role: "ASSISTANT",
                  },
                ],
              },
              id: "task-test",
              status: "COMPLETED",
            };
      }

      return { id: "task-test", status: "RUNNING" };
    });

    const app = express();
    app.use(
      "/api/tasks",
      createStreamRouter({
        getUserId: () => "user-test",
        pollIntervalMs: 5,
        store: { agentRun: { findFirst } },
      }),
    );

    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/api/tasks/task-test/stream`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"type":"message"');
    expect(body).toContain('"content":"Worker completed the task."');
    expect(body).toContain('"type":"status_update"');
    expect(body).toContain('"status":"STOPPED"');
  });
});
