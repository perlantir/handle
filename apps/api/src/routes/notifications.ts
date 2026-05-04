import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import { checkTemporalConnection, loadTemporalSettings } from "../temporal/client";
import { asyncHandler } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  ensureNotificationSettings,
  serializeNotificationChannelStatuses,
  serializeNotificationSettings,
  testNotificationChannel,
} from "../notifications/notificationService";

const notificationEventSchema = z.enum([
  "TASK_COMPLETED",
  "TASK_FAILED",
  "APPROVAL_NEEDED",
  "CRITIC_FLAGGED",
]);

const updateNotificationsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    emailRecipient: z.string().email().nullable().optional(),
    eventTypes: z.array(notificationEventSchema).min(1).optional(),
    slackChannelId: z.string().min(1).nullable().optional(),
    slackEnabled: z.boolean().optional(),
    webhookEnabled: z.boolean().optional(),
    webhookUrl: z.string().url().nullable().optional(),
  })
  .strict();

const updateProjectNotificationsSchema = updateNotificationsSchema.extend({
  inheritGlobal: z.boolean().optional(),
});

const testNotificationSchema = z
  .object({
    channel: z.enum(["EMAIL", "SLACK", "WEBHOOK"]),
    recipient: z.string().min(1),
  })
  .strict();

export const notificationsRouter = Router();

function compactData<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

notificationsRouter.get(
  "/settings/notifications",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [notifications, temporalSettings] = await Promise.all([
      ensureNotificationSettings(prisma),
      loadTemporalSettings(prisma),
    ]);
    const deliveries = await prisma.notificationDelivery.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      where: { userId },
    });
    const temporalHealth = await checkTemporalConnection(temporalSettings);

    await prisma.temporalSettings.update({
      data: {
        lastCheckedAt: new Date(temporalHealth.checkedAt),
        lastErrorCode: temporalHealth.status === "online" ? null : "unreachable",
        lastErrorMessage: temporalHealth.status === "online" ? null : temporalHealth.detail,
        lastHealthStatus: temporalHealth.status,
      },
      where: { id: "global" },
    }).catch(() => undefined);

    return res.json({
      channelStatus: serializeNotificationChannelStatuses({
        deliveries,
        settings: notifications,
      }),
      failureBanner: deliveries.some((delivery) => delivery.status === "FAILED")
        ? "One or more notification deliveries failed. Review the channel cards below."
        : null,
      notifications: serializeNotificationSettings(notifications),
      temporal: {
        address: temporalSettings.address,
        enabled: temporalSettings.enabled,
        health: temporalHealth,
        namespace: temporalSettings.namespace,
        taskQueue: temporalSettings.taskQueue,
      },
    });
  }),
);

notificationsRouter.post(
  "/settings/notifications/test",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = testNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    await ensureNotificationSettings(prisma);
    const result = await testNotificationChannel({
      channel: parsed.data.channel,
      recipient: parsed.data.recipient,
      userId,
    });

    return res.status(result.ok ? 200 : 400).json(result);
  }),
);

notificationsRouter.put(
  "/settings/notifications",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = updateNotificationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    await ensureNotificationSettings(prisma);
    const notifications = await prisma.notificationSettings.update({
      data: compactData(parsed.data),
      where: { id: "global" },
    });
    return res.json({ notifications: serializeNotificationSettings(notifications) });
  }),
);

notificationsRouter.get(
  "/projects/:projectId/notifications",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ error: "Project id is required" });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const settings = await prisma.projectNotificationSettings.findUnique({
      where: { projectId } as never,
    });
    return res.json({ notifications: settings });
  }),
);

notificationsRouter.put(
  "/projects/:projectId/notifications",
  asyncHandler(async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = updateProjectNotificationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ error: "Project id is required" });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const data = compactData(parsed.data);
    const notifications = await prisma.projectNotificationSettings.upsert({
      create: {
        ...data,
        project: { connect: { id: projectId } },
      } as never,
      update: data,
      where: { projectId } as never,
    });
    return res.json({ notifications });
  }),
);
