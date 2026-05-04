import type {
  NotificationChannel,
  NotificationChannelStatusSummary,
  NotificationEventType,
  NotificationSettingsSummary,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { createDefaultIntegrationToolRuntime } from "../integrations/toolRuntime";
import { appendActionLog } from "../lib/actionLog";
import { appendAuditEvent } from "../lib/auditLog";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";

const GLOBAL_SETTINGS_ID = "global";
const DEFAULT_EVENTS: NotificationEventType[] = [
  "TASK_COMPLETED",
  "TASK_FAILED",
  "APPROVAL_NEEDED",
  "CRITIC_FLAGGED",
];

export interface NotificationServiceStore {
  agentRun?: {
    findUnique(args: unknown): Promise<{
      conversationId: string;
      goal: string;
      id: string;
      result?: string | null;
      status: string;
      userId?: string | null;
      conversation?: {
        project?: {
          id: string;
          name: string;
          notificationSettings?: unknown | null;
        } | null;
      } | null;
    } | null>;
    update?(args: unknown): Promise<unknown>;
  };
  notificationDelivery?: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  notificationSettings?: {
    update?(args: unknown): Promise<NotificationSettingsRow>;
    upsert(args: unknown): Promise<NotificationSettingsRow>;
  };
  projectNotificationSettings?: {
    findUnique(args: unknown): Promise<ProjectNotificationSettingsRow | null>;
    upsert?(args: unknown): Promise<ProjectNotificationSettingsRow>;
  };
}

interface NotificationSettingsRow {
  emailEnabled: boolean;
  emailLastTestError?: string | null;
  emailLastTestStatus?: string | null;
  emailLastTestedAt?: Date | string | null;
  emailRecipient: string | null;
  eventTypes: unknown;
  id: string;
  slackChannelId: string | null;
  slackEnabled: boolean;
  slackLastTestError?: string | null;
  slackLastTestStatus?: string | null;
  slackLastTestedAt?: Date | string | null;
  updatedAt?: Date | string;
  webhookEnabled: boolean;
  webhookLastTestError?: string | null;
  webhookLastTestStatus?: string | null;
  webhookLastTestedAt?: Date | string | null;
  webhookUrl: string | null;
}

interface NotificationDeliveryRow {
  channel: NotificationChannel;
  errorMessage?: string | null;
  status: string;
  dispatchedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

interface ProjectNotificationSettingsRow {
  emailEnabled: boolean | null;
  emailRecipient: string | null;
  eventTypes: unknown | null;
  inheritGlobal: boolean;
  projectId: string;
  slackChannelId: string | null;
  slackEnabled: boolean | null;
  updatedAt?: Date | string;
  webhookEnabled: boolean | null;
  webhookUrl: string | null;
}

export interface NotifyTaskEventInput {
  agentRunId: string;
  eventType: NotificationEventType;
  detail?: string;
}

function normalizeEvents(value: unknown): NotificationEventType[] {
  if (!Array.isArray(value)) return DEFAULT_EVENTS;
  const allowed = new Set(DEFAULT_EVENTS);
  const events = value.filter(
    (item): item is NotificationEventType =>
      typeof item === "string" && allowed.has(item as NotificationEventType),
  );
  return events.length > 0 ? events : DEFAULT_EVENTS;
}

export async function ensureNotificationSettings(
  store: NotificationServiceStore = prisma,
) {
  if (!store.notificationSettings) {
    throw new Error("Notification settings store is unavailable.");
  }

  return store.notificationSettings.upsert({
    create: {
      emailEnabled: false,
      id: GLOBAL_SETTINGS_ID,
      slackEnabled: false,
      webhookEnabled: false,
    },
    update: {},
    where: { id: GLOBAL_SETTINGS_ID },
  });
}

export function serializeNotificationSettings(
  row: NotificationSettingsRow,
): NotificationSettingsSummary {
  return {
    emailEnabled: row.emailEnabled,
    emailRecipient: row.emailRecipient,
    eventTypes: normalizeEvents(row.eventTypes),
    slackChannelId: row.slackChannelId,
    slackEnabled: row.slackEnabled,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt ?? null,
    webhookEnabled: row.webhookEnabled,
    webhookUrl: row.webhookUrl,
  };
}

export function serializeNotificationChannelStatuses({
  deliveries = [],
  settings,
}: {
  deliveries?: NotificationDeliveryRow[];
  settings: NotificationSettingsRow;
}): NotificationChannelStatusSummary[] {
  const latestDeliveryByChannel = new Map<NotificationChannel, NotificationDeliveryRow>();
  for (const delivery of deliveries) {
    if (!latestDeliveryByChannel.has(delivery.channel)) {
      latestDeliveryByChannel.set(delivery.channel, delivery);
    }
  }

  return (["EMAIL", "SLACK", "WEBHOOK"] as NotificationChannel[]).map((channel) => {
    const delivery = latestDeliveryByChannel.get(channel);
    const test = testFields(settings, channel);
    return {
      channel,
      lastDeliveryAt: iso(delivery?.dispatchedAt ?? delivery?.updatedAt ?? null),
      lastDeliveryError: delivery?.errorMessage ?? null,
      lastDeliveryStatus: (delivery?.status as NotificationChannelStatusSummary["lastDeliveryStatus"]) ?? null,
      lastTestAt: iso(test.testedAt),
      lastTestError: test.error,
      lastTestStatus: test.status,
    };
  });
}

function effectiveSettings(
  global: NotificationSettingsRow,
  project: ProjectNotificationSettingsRow | null,
) {
  if (!project || project.inheritGlobal) return serializeNotificationSettings(global);

  return {
    emailEnabled: project.emailEnabled ?? global.emailEnabled,
    emailRecipient: project.emailRecipient ?? global.emailRecipient,
    eventTypes: normalizeEvents(project.eventTypes ?? global.eventTypes),
    slackChannelId: project.slackChannelId ?? global.slackChannelId,
    slackEnabled: project.slackEnabled ?? global.slackEnabled,
    updatedAt:
      project.updatedAt instanceof Date
        ? project.updatedAt.toISOString()
        : project.updatedAt ?? null,
    webhookEnabled: project.webhookEnabled ?? global.webhookEnabled,
    webhookUrl: project.webhookUrl ?? global.webhookUrl,
  };
}

function channelsForSettings(settings: NotificationSettingsSummary) {
  const channels: Array<{ channel: NotificationChannel; recipient: string }> = [];
  if (settings.emailEnabled && settings.emailRecipient) {
    channels.push({ channel: "EMAIL", recipient: settings.emailRecipient });
  }
  if (settings.slackEnabled && settings.slackChannelId) {
    channels.push({ channel: "SLACK", recipient: settings.slackChannelId });
  }
  if (settings.webhookEnabled && settings.webhookUrl) {
    channels.push({ channel: "WEBHOOK", recipient: settings.webhookUrl });
  }
  return channels;
}

function notificationText({
  detail,
  eventType,
  goal,
  projectName,
  result,
}: {
  detail?: string;
  eventType: NotificationEventType;
  goal: string;
  projectName?: string | null;
  result?: string | null;
}) {
  const prefix = projectName ? `${projectName}: ` : "";
  const eventLabel = eventType
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
  return redactSecrets(
    `${prefix}${eventLabel} - ${goal}${detail ? ` (${detail})` : ""}${
      result ? `\n\n${result.slice(0, 1000)}` : ""
    }`,
  );
}

async function deliverNotification({
  channel,
  payload,
  recipient,
  userId,
}: {
  channel: NotificationChannel;
  payload: Record<string, unknown>;
  recipient: string;
  userId: string;
}) {
  if (channel === "WEBHOOK") {
    const response = await fetch(recipient, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}`);
    }
    return;
  }

  const runtime = createDefaultIntegrationToolRuntime();
  if (channel === "EMAIL") {
    await runtime.request({
      connectorId: "gmail",
      data: {
        raw: Buffer.from(
          `To: ${recipient}\r\nSubject: Handle task update\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${payload.text}`,
          "utf8",
        )
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, ""),
      },
      endpoint: "/gmail/v1/users/me/messages/send",
      method: "POST",
      userId,
    });
    return;
  }

  if (channel === "SLACK") {
    await runtime.request({
      connectorId: "slack",
      data: { channel: recipient, text: payload.text },
      endpoint: "/api/chat.postMessage",
      method: "POST",
      userId,
    });
  }
}

function testFields(row: NotificationSettingsRow, channel: NotificationChannel) {
  if (channel === "EMAIL") {
    return {
      error: row.emailLastTestError ?? null,
      status: normalizeTestStatus(row.emailLastTestStatus),
      testedAt: row.emailLastTestedAt ?? null,
    };
  }
  if (channel === "SLACK") {
    return {
      error: row.slackLastTestError ?? null,
      status: normalizeTestStatus(row.slackLastTestStatus),
      testedAt: row.slackLastTestedAt ?? null,
    };
  }
  return {
    error: row.webhookLastTestError ?? null,
    status: normalizeTestStatus(row.webhookLastTestStatus),
    testedAt: row.webhookLastTestedAt ?? null,
  };
}

function normalizeTestStatus(value: string | null | undefined): "FAILED" | "SENT" | null {
  return value === "SENT" || value === "FAILED" ? value : null;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function validateRecipient(channel: NotificationChannel, recipient: string) {
  const trimmed = recipient.trim();
  if (!trimmed) throw new Error("Target is required.");
  if (channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid email address.");
  }
  if (channel === "SLACK" && !/^(#[A-Za-z0-9._-]+|[CGD][A-Z0-9]{8,})$/.test(trimmed)) {
    throw new Error("Enter a Slack channel name like #updates or a Slack channel ID.");
  }
  if (channel === "WEBHOOK") {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Webhook URL must use http or https.");
      }
    } catch {
      throw new Error("Enter a valid webhook URL.");
    }
  }
  return trimmed;
}

function testUpdateData(channel: NotificationChannel, status: "FAILED" | "SENT", error: string | null) {
  const now = new Date();
  if (channel === "EMAIL") {
    return {
      emailLastTestError: error,
      emailLastTestStatus: status,
      emailLastTestedAt: now,
    };
  }
  if (channel === "SLACK") {
    return {
      slackLastTestError: error,
      slackLastTestStatus: status,
      slackLastTestedAt: now,
    };
  }
  return {
    webhookLastTestError: error,
    webhookLastTestStatus: status,
    webhookLastTestedAt: now,
  };
}

export async function testNotificationChannel({
  channel,
  recipient,
  store = prisma,
  userId,
}: {
  channel: NotificationChannel;
  recipient: string;
  store?: NotificationServiceStore;
  userId: string;
}) {
  if (!store.notificationSettings?.update) {
    throw new Error("Notification settings store is unavailable.");
  }

  let target = recipient.trim();
  const payload = {
    eventType: "TASK_COMPLETED",
    goal: "Handle notification test",
    projectId: null,
    projectName: null,
    status: "TEST",
    text: "Handle notification test - if you see this, the channel is connected.",
  };

  try {
    target = validateRecipient(channel, recipient);
    await deliverNotification({
      channel,
      payload,
      recipient: target,
      userId,
    });
    const settings = await store.notificationSettings.update({
      data: testUpdateData(channel, "SENT", null),
      where: { id: GLOBAL_SETTINGS_ID },
    });
    await appendAuditEvent({
      channel,
      event: "notification_sent",
      status: "SENT",
      target: redactSecrets(target),
      taskId: "notification-test",
      test: true,
    }).catch(() => undefined);
    return {
      ok: true,
      status: serializeNotificationChannelStatuses({ settings }).find((item) => item.channel === channel),
    };
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    const settings = await store.notificationSettings.update({
      data: testUpdateData(channel, "FAILED", message),
      where: { id: GLOBAL_SETTINGS_ID },
    });
    await appendAuditEvent({
      channel,
      errorClass: err instanceof Error ? err.name : "Error",
      event: "notification_failed",
      status: "FAILED",
      target: redactSecrets(target),
      taskId: "notification-test",
      test: true,
    }).catch(() => undefined);
    return {
      error: message,
      ok: false,
      status: serializeNotificationChannelStatuses({ settings }).find((item) => item.channel === channel),
    };
  }
}

export async function notifyTaskEvent(
  input: NotifyTaskEventInput,
  store: NotificationServiceStore = prisma,
) {
  if (!store.agentRun || !store.notificationDelivery) return [];

  const run = await store.agentRun.findUnique({
    include: {
      conversation: {
        include: {
          project: {
            include: { notificationSettings: true },
          },
        },
      },
    },
    where: { id: input.agentRunId },
  });
  if (!run?.userId) return [];

  const global = await ensureNotificationSettings(store);
  const projectId = run.conversation?.project?.id ?? null;
  const projectSettings = projectId
    ? ((await store.projectNotificationSettings?.findUnique({
        where: { projectId },
      })) as ProjectNotificationSettingsRow | null)
    : null;
  const settings = effectiveSettings(global, projectSettings);
  if (!settings.eventTypes.includes(input.eventType)) return [];

  const channels = channelsForSettings(settings);
  const payload = {
    agentRunId: input.agentRunId,
    detail: input.detail ?? null,
    eventType: input.eventType,
    goal: redactSecrets(run.goal),
    projectId,
    projectName: run.conversation?.project?.name ?? null,
    status: run.status,
    text: notificationText({
      ...(input.detail ? { detail: input.detail } : {}),
      eventType: input.eventType,
      goal: run.goal,
      projectName: run.conversation?.project?.name ?? null,
      result: run.result ?? null,
    }),
  };

  const deliveries: Array<{ channel: NotificationChannel; id: string }> = [];
  for (const channel of channels) {
    const delivery = await store.notificationDelivery.create({
      data: {
        agentRunId: input.agentRunId,
        channel: channel.channel,
        eventType: input.eventType,
        payload: payload as Prisma.InputJsonValue,
        projectId,
        recipient: redactSecrets(channel.recipient),
        status: "PENDING",
        userId: run.userId,
      },
    });
    deliveries.push({ channel: channel.channel, id: delivery.id });

    try {
      await deliverNotification({
        channel: channel.channel,
        payload,
        recipient: channel.recipient,
        userId: run.userId,
      });
      await store.notificationDelivery.update({
        data: { dispatchedAt: new Date(), status: "SENT" },
        where: { id: delivery.id },
      });
      await appendActionLog({
        conversationId: run.conversationId,
        description: `Sent ${channel.channel.toLowerCase()} notification for ${input.eventType}`,
        metadata: { channel: channel.channel, eventType: input.eventType },
        outcomeType: "integration_action",
        projectId: projectId ?? "unknown",
        reversible: false,
        target: channel.channel,
        taskId: input.agentRunId,
        timestamp: new Date().toISOString(),
      });
      await appendAuditEvent({
        channel: channel.channel,
        event: "notification_sent",
        eventType: input.eventType,
        status: "SENT",
        target: channel.channel === "WEBHOOK" ? redactSecrets(channel.recipient) : channel.channel,
        taskId: input.agentRunId,
      }).catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        {
          agentRunId: input.agentRunId,
          channel: channel.channel,
          err,
        },
        "Notification delivery failed",
      );
      await store.notificationDelivery.update({
        data: {
          errorCode: "delivery_failed",
          errorMessage: redactSecrets(message),
          status: "FAILED",
        },
        where: { id: delivery.id },
      });
      await appendActionLog({
        conversationId: run.conversationId,
        description: `Failed ${channel.channel.toLowerCase()} notification for ${input.eventType}`,
        metadata: {
          channel: channel.channel,
          errorClass: err instanceof Error ? err.name : "Error",
          eventType: input.eventType,
        },
        outcomeType: "integration_action",
        projectId: projectId ?? "unknown",
        reversible: false,
        target: channel.channel,
        taskId: input.agentRunId,
        timestamp: new Date().toISOString(),
      }).catch(() => undefined);
      await appendAuditEvent({
        channel: channel.channel,
        errorClass: err instanceof Error ? err.name : "Error",
        event: "notification_failed",
        eventType: input.eventType,
        status: "FAILED",
        target: channel.channel === "WEBHOOK" ? redactSecrets(channel.recipient) : channel.channel,
        taskId: input.agentRunId,
      }).catch(() => undefined);
    }
  }

  if (deliveries.length > 0 && store.agentRun.update) {
    await store.agentRun.update({
      data: { lastNotifiedAt: new Date() },
      where: { id: input.agentRunId },
    }).catch(() => undefined);
  }

  return deliveries;
}
