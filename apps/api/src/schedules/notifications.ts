import type { NotificationChannel, NotificationEventType } from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { createDefaultIntegrationToolRuntime } from "../integrations/toolRuntime";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";

type ScheduleStore = typeof prisma;

interface ScheduleNotificationInput {
  eventType: NotificationEventType;
  outputSummary?: string | null;
  projectId?: string | null;
  scheduleId: string;
  scheduleName: string;
  scheduleRunId: string;
  status: string;
  userId: string;
}

export async function dispatchScheduleNotifications({
  eventType,
  outputSummary,
  projectId,
  scheduleId,
  scheduleName,
  scheduleRunId,
  status,
  store = prisma,
  userId,
}: ScheduleNotificationInput & { store?: ScheduleStore }) {
  const settings = await resolveNotificationSettings({
    ...(projectId ? { projectId } : {}),
    store,
  });
  if (!isEventEnabled(settings.eventTypes, eventType)) return [];

  const payload = {
    eventType,
    link: `/schedules?selected=${encodeURIComponent(scheduleId)}`,
    outputSummary: outputSummary ? redactSecrets(outputSummary).slice(0, 2000) : null,
    scheduleId,
    scheduleName,
    scheduleRunId,
    status,
  };
  const deliveries = [];
  if (settings.emailEnabled && settings.emailRecipient) {
    deliveries.push(await sendDelivery({
      channel: "EMAIL",
      eventType,
      payload,
      ...(projectId ? { projectId } : {}),
      recipient: settings.emailRecipient,
      sender: sendEmail,
      store,
      userId,
    }));
  }
  if (settings.slackEnabled && settings.slackChannelId) {
    deliveries.push(await sendDelivery({
      channel: "SLACK",
      eventType,
      payload,
      ...(projectId ? { projectId } : {}),
      recipient: settings.slackChannelId,
      sender: sendSlack,
      store,
      userId,
    }));
  }
  if (settings.webhookEnabled && settings.webhookUrl) {
    deliveries.push(await sendDelivery({
      channel: "WEBHOOK",
      eventType,
      payload,
      ...(projectId ? { projectId } : {}),
      recipient: settings.webhookUrl,
      sender: sendWebhook,
      store,
      userId,
    }));
  }
  return deliveries;
}

async function resolveNotificationSettings({
  projectId,
  store,
}: {
  projectId?: string | null;
  store: ScheduleStore;
}) {
  const global = await store.notificationSettings.upsert({
    create: { id: "global" },
    update: {},
    where: { id: "global" },
  });
  if (!projectId) return normalizeSettings(global);
  const project = await store.projectNotificationSettings.findUnique({ where: { projectId } });
  if (!project || project.inheritGlobal) return normalizeSettings(global);
  return normalizeSettings({
    emailEnabled: project.emailEnabled ?? global.emailEnabled,
    emailRecipient: project.emailRecipient ?? global.emailRecipient,
    eventTypes: project.eventTypes ?? global.eventTypes,
    slackChannelId: project.slackChannelId ?? global.slackChannelId,
    slackEnabled: project.slackEnabled ?? global.slackEnabled,
    webhookEnabled: project.webhookEnabled ?? global.webhookEnabled,
    webhookUrl: project.webhookUrl ?? global.webhookUrl,
  });
}

async function sendDelivery({
  channel,
  eventType,
  payload,
  projectId,
  recipient,
  sender,
  store,
  userId,
}: {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
  projectId?: string | null;
  recipient: string;
  sender(input: { payload: Record<string, unknown>; recipient: string; userId: string }): Promise<void>;
  store: ScheduleStore;
  userId: string;
}) {
  const delivery = await store.notificationDelivery.create({
    data: {
      channel,
      eventType,
      payload: jsonInput(payload),
      projectId: projectId ?? null,
      recipient: redactTarget(recipient),
      status: "PENDING",
      userId,
    },
  });
  try {
    await sender({ payload, recipient, userId });
    return store.notificationDelivery.update({
      data: { dispatchedAt: new Date(), status: "SENT" },
      where: { id: delivery.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notification failed";
    logger.warn({ channel, err, eventType }, "Schedule notification delivery failed");
    return store.notificationDelivery.update({
      data: {
        errorCode: "schedule_notification_failed",
        errorMessage: redactSecrets(message),
        status: "FAILED",
      },
      where: { id: delivery.id },
    });
  }
}

async function sendEmail({ payload, recipient, userId }: { payload: Record<string, unknown>; recipient: string; userId: string }) {
  const runtime = createDefaultIntegrationToolRuntime();
  await runtime.request({
    connectorId: "gmail",
    data: {
      raw: base64Url(`To: ${recipient}
Subject: Handle schedule ${payload.status}: ${payload.scheduleName}
Content-Type: text/plain; charset="UTF-8"

${notificationText(payload)}
`),
    },
    endpoint: "/gmail/v1/users/me/messages/send",
    method: "POST",
    userId,
  });
}

async function sendSlack({ payload, recipient, userId }: { payload: Record<string, unknown>; recipient: string; userId: string }) {
  const runtime = createDefaultIntegrationToolRuntime();
  const result = await runtime.request({
    connectorId: "slack",
    data: { channel: recipient, text: notificationText(payload) },
    endpoint: "/api/chat.postMessage",
    method: "POST",
    userId,
  });
  if (result.data && typeof result.data === "object" && (result.data as Record<string, unknown>).ok === false) {
    const error = String((result.data as Record<string, unknown>).error ?? "unknown_error");
    throw new Error(`Slack returned ${error}`);
  }
}

async function sendWebhook({ payload, recipient }: { payload: Record<string, unknown>; recipient: string }) {
  const response = await fetch(recipient, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}`);
  }
}

function normalizeSettings(value: {
  emailEnabled: boolean;
  emailRecipient?: string | null;
  eventTypes: unknown;
  slackChannelId?: string | null;
  slackEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl?: string | null;
}) {
  const eventTypes = Array.isArray(value.eventTypes)
    ? value.eventTypes.map(String)
    : DEFAULT_NOTIFICATION_EVENTS;
  return {
    emailEnabled: value.emailEnabled,
    emailRecipient: value.emailRecipient ?? null,
    eventTypes,
    slackChannelId: value.slackChannelId ?? null,
    slackEnabled: value.slackEnabled,
    webhookEnabled: value.webhookEnabled,
    webhookUrl: value.webhookUrl ?? null,
  };
}

const DEFAULT_NOTIFICATION_EVENTS = [
  "TASK_COMPLETED",
  "TASK_FAILED",
  "APPROVAL_NEEDED",
  "CRITIC_FLAGGED",
  "SCHEDULE_RUN_COMPLETED",
  "SCHEDULE_RUN_FAILED",
  "SCHEDULE_RUN_SKIPPED",
  "SCHEDULE_APPROVAL_NEEDED",
  "SCHEDULE_INTEGRATION_WAIT",
];

function isEventEnabled(enabled: string[], eventType: NotificationEventType) {
  if (enabled.includes(eventType)) return true;
  const compatibility: Partial<Record<NotificationEventType, NotificationEventType>> = {
    SCHEDULE_APPROVAL_NEEDED: "APPROVAL_NEEDED",
    SCHEDULE_RUN_COMPLETED: "TASK_COMPLETED",
    SCHEDULE_RUN_FAILED: "TASK_FAILED",
  };
  const fallback = compatibility[eventType];
  return fallback ? enabled.includes(fallback) : false;
}

function notificationText(payload: Record<string, unknown>) {
  return [
    `Schedule: ${payload.scheduleName}`,
    `Status: ${payload.status}`,
    `Run: ${payload.scheduleRunId}`,
    payload.outputSummary ? `Summary: ${payload.outputSummary}` : null,
    `Open: ${payload.link}`,
  ].filter(Boolean).join("\n");
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function redactTarget(value: string) {
  if (value.startsWith("http")) return value.replace(/\/\/([^/@]+)@/, "//[REDACTED]@").replace(/\?.*$/, "?[REDACTED]");
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name?.slice(0, 2) ?? ""}***@${domain ?? "redacted"}`;
  }
  return value;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
