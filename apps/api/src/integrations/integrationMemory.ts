import type { IntegrationConnectorId } from "@handle/shared";
import type { MemoryScope } from "@handle/shared";
import type { ToolExecutionContext } from "../agent/toolRegistry";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { appendMessageToZep } from "../memory/sessionMemory";

const CONNECTOR_LABELS: Record<IntegrationConnectorId, string> = {
  cloudflare: "Cloudflare",
  github: "GitHub",
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  "google-docs": "Google Docs",
  "google-drive": "Google Drive",
  "google-sheets": "Google Sheets",
  linear: "Linear",
  notion: "Notion",
  obsidian: "Obsidian",
  slack: "Slack",
  vercel: "Vercel",
  zapier: "Zapier",
};

interface IntegrationMemoryDeps {
  appendToMemory?: typeof appendMessageToZep;
  integrationLookup?: {
    findFirst(args: {
      orderBy: Array<Record<string, "asc" | "desc">>;
      where: {
        accountAlias?: string;
        connectorId: unknown;
        status: "CONNECTED";
        userId: string;
      };
    }): Promise<{ memoryScope: MemoryScope } | null>;
  };
}

export async function maybeRecordIntegrationMemoryCandidate({
  accountAlias,
  action,
  connectorId,
  context,
  target,
}: {
  accountAlias?: string | null;
  action: string;
  connectorId: IntegrationConnectorId;
  context: ToolExecutionContext;
  target: string;
}, deps: IntegrationMemoryDeps = {}) {
  if (!context.memoryProject || context.memoryEnabled === false || !context.userId) {
    return { reason: "memory_disabled", written: false };
  }

  const connectorKey = connectorIdToPrisma(connectorId);
  const integrationLookup = deps.integrationLookup ?? prisma.integration;
  const integration = await integrationLookup.findFirst({
    orderBy: [{ defaultAccount: "desc" }, { updatedAt: "desc" }],
    where: {
      connectorId: connectorKey,
      ...(accountAlias ? { accountAlias } : {}),
      status: "CONNECTED",
      userId: context.userId,
    },
  });
  if (!integration || integration.memoryScope === "NONE") {
    return { reason: "connector_memory_none", written: false };
  }

  const fact = `${CONNECTOR_LABELS[connectorId]} ${action} target: ${target}`;
  const appendToMemory = deps.appendToMemory ?? appendMessageToZep;
  const result = await appendToMemory({
    content: fact,
    extractionMode: "explicit_fact",
    project: {
      ...context.memoryProject,
      memoryScope: integration.memoryScope,
    },
    role: "USER",
  }).catch((err) => {
    logger.warn(
      { connectorId, err, projectId: context.projectId ?? null, taskId: context.taskId },
      "Integration memory candidate write failed",
    );
    return { ok: false as const };
  });

  return { written: Boolean(result.ok) };
}

function connectorIdToPrisma(connectorId: IntegrationConnectorId) {
  return connectorId.toUpperCase().replace(/-/g, "_") as never;
}
