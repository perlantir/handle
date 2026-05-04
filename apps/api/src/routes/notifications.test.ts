import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationsRouter } from "./notifications";

vi.mock("../auth/clerkMiddleware", () => ({
  getAuthenticatedUserId: () => "user-test",
}));

vi.mock("../temporal/client", () => ({
  checkTemporalConnection: vi.fn(async () => ({
    checkedAt: "2026-05-04T00:00:00.000Z",
    detail: "Temporal reachable",
    status: "online",
  })),
  loadTemporalSettings: vi.fn(async () => ({
    address: "127.0.0.1:7233",
    enabled: true,
    namespace: "default",
    taskQueue: "handle-agent-runs",
  })),
}));

const notificationSettings = {
  emailEnabled: false,
  emailRecipient: null,
  eventTypes: ["TASK_COMPLETED", "TASK_FAILED", "APPROVAL_NEEDED", "CRITIC_FLAGGED"],
  id: "global",
  slackChannelId: null,
  slackEnabled: false,
  updatedAt: new Date("2026-05-04T00:00:00.000Z"),
  webhookEnabled: false,
  webhookUrl: null,
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    notificationSettings: {
      update: vi.fn(async (args) => ({ ...notificationSettings, ...args.data })),
      upsert: vi.fn(async () => notificationSettings),
    },
    project: {
      findUnique: vi.fn(async () => ({ id: "project-1" })),
    },
    projectNotificationSettings: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args) => ({ ...args.create, id: "project-notifications-1" })),
    },
    temporalSettings: {
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({
        address: "127.0.0.1:7233",
        enabled: true,
        namespace: "default",
        taskQueue: "handle-agent-runs",
      })),
    },
  },
}));

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api", notificationsRouter);
  return server;
}

describe("notifications routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads notification and Temporal status", async () => {
    const response = await request(app()).get("/api/settings/notifications");

    expect(response.status).toBe(200);
    expect(response.body.notifications.emailEnabled).toBe(false);
    expect(response.body.temporal.health.status).toBe("online");
  });

  it("saves opt-in channels", async () => {
    const response = await request(app())
      .put("/api/settings/notifications")
      .send({
        eventTypes: ["TASK_COMPLETED"],
        webhookEnabled: true,
        webhookUrl: "https://example.com/hook",
      });

    expect(response.status).toBe(200);
    expect(response.body.notifications.webhookEnabled).toBe(true);
    expect(response.body.notifications.eventTypes).toEqual(["TASK_COMPLETED"]);
  });

  it("saves per-project notification overrides", async () => {
    const response = await request(app())
      .put("/api/projects/project-1/notifications")
      .send({
        inheritGlobal: false,
        slackChannelId: "C123",
        slackEnabled: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.notifications.slackEnabled).toBe(true);
  });
});
