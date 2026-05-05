import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchScheduleNotifications } from "./notifications";

const requestMock = vi.hoisted(() => vi.fn());

vi.mock("../integrations/toolRuntime", () => ({
  createDefaultIntegrationToolRuntime: () => ({
    request: requestMock,
  }),
}));

describe("dispatchScheduleNotifications", () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ data: { ok: true } });
  });

  it("honors a schedule EMAIL output policy instead of globally enabled Slack", async () => {
    const deliveries: any[] = [];
    const store = createStore({ deliveries });

    await dispatchScheduleNotifications({
      eventType: "SCHEDULE_RUN_COMPLETED",
      notificationPolicy: { outputChannel: "EMAIL" },
      outputSummary: "Hello",
      scheduleId: "schedule-1",
      scheduleName: "Daily Hello email",
      scheduleRunId: "run-1",
      status: "COMPLETED",
      store: store as never,
      userId: "user-1",
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      connectorId: "gmail",
      endpoint: "/gmail/v1/users/me/messages/send",
      method: "POST",
      userId: "user-1",
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      channel: "EMAIL",
      eventType: "SCHEDULE_RUN_COMPLETED",
      recipient: "ni***@example.com",
      status: "SENT",
    });
  });

  it("does not send external notifications for IN_APP schedule output", async () => {
    const deliveries: any[] = [];
    const store = createStore({ deliveries });

    const result = await dispatchScheduleNotifications({
      eventType: "SCHEDULE_RUN_COMPLETED",
      notificationPolicy: { outputChannel: "IN_APP" },
      scheduleId: "schedule-1",
      scheduleName: "Daily Hello email",
      scheduleRunId: "run-1",
      status: "COMPLETED",
      store: store as never,
      userId: "user-1",
    });

    expect(result).toEqual([]);
    expect(requestMock).not.toHaveBeenCalled();
    expect(deliveries).toHaveLength(0);
  });
});

function createStore({ deliveries }: { deliveries: any[] }) {
  return {
    notificationDelivery: {
      create: async ({ data }: any) => {
        const row = { ...data, id: `delivery-${deliveries.length + 1}`, status: data.status };
        deliveries.push(row);
        return row;
      },
      update: async ({ data, where }: any) => {
        const index = deliveries.findIndex((row) => row.id === where.id);
        deliveries[index] = { ...deliveries[index], ...data };
        return deliveries[index];
      },
    },
    notificationSettings: {
      upsert: async () => ({
        emailEnabled: false,
        emailRecipient: "nick@example.com",
        eventTypes: ["TASK_COMPLETED"],
        id: "global",
        slackChannelId: "C123",
        slackEnabled: true,
        webhookEnabled: false,
        webhookUrl: null,
      }),
    },
    projectNotificationSettings: {
      findUnique: async () => null,
    },
  };
}
