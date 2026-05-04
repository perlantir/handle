import type {
  NotificationChannel,
  NotificationEventType,
  NotificationSettingsSummary,
} from "@handle/shared";
import type { Prisma } from "@prisma/client";
import { createDefaultIntegrationToolRuntime } from "../integrations/toolRuntime";
import { appendActionLog } from "../lib/actionLog";
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
    upsert(args: unknown): Promise<NotificationSettingsRow>;
  };
  projectNotificationSettings?: {
    findUnique(args: unknown): Promise<ProjectNotificationSettingsRow | null>;
    upsert?(args: unknown): Promise<ProjectNotificationSettingsRow>;
  };
}

interface NotificationSettingsRow {
  emailEnabled: boolean;
  emailRecipient: string | null;
  eventTypes: unknown;
  id: string;
  slackChannelId: string | null;
  slackEnabled: boolean;
  updatedAt?: Date | string;
  webhookEnabled: boolean;
  webhookUrl: string | null;
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
