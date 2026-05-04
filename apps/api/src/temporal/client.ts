import { Connection, Client } from "@temporalio/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import {
  DEFAULT_TEMPORAL_ADDRESS,
  DEFAULT_TEMPORAL_NAMESPACE,
  DEFAULT_TEMPORAL_TASK_QUEUE,
  type TemporalRuntimeSettings,
} from "./constants";

const GLOBAL_SETTINGS_ID = "global";

export interface TemporalSettingsStore {
  temporalSettings?: {
    upsert(args: unknown): Promise<{
      address: string;
      enabled: boolean;
      namespace: string;
      taskQueue: string;
    }>;
    update?(args: unknown): Promise<unknown>;
  };
}

export interface TemporalConnectionHealth {
  checkedAt: string;
  detail: string | null;
  status: "offline" | "online";
}

export async function loadTemporalSettings(
  store: TemporalSettingsStore = prisma,
): Promise<TemporalRuntimeSettings> {
  if (!store.temporalSettings) {
    return {
      address: DEFAULT_TEMPORAL_ADDRESS,
      enabled: false,
      namespace: DEFAULT_TEMPORAL_NAMESPACE,
      taskQueue: DEFAULT_TEMPORAL_TASK_QUEUE,
    };
  }

  const row = await store.temporalSettings.upsert({
    create: {
      address: DEFAULT_TEMPORAL_ADDRESS,
      enabled: true,
      id: GLOBAL_SETTINGS_ID,
      namespace: DEFAULT_TEMPORAL_NAMESPACE,
      taskQueue: DEFAULT_TEMPORAL_TASK_QUEUE,
    },
    update: {},
    where: { id: GLOBAL_SETTINGS_ID },
  });

  return {
    address: row.address || DEFAULT_TEMPORAL_ADDRESS,
    enabled: row.enabled,
    namespace: row.namespace || DEFAULT_TEMPORAL_NAMESPACE,
    taskQueue: row.taskQueue || DEFAULT_TEMPORAL_TASK_QUEUE,
  };
}

export async function createTemporalClient(
  settings: TemporalRuntimeSettings,
): Promise<Client> {
  const connection = await Connection.connect({ address: settings.address });
  return new Client({
    connection,
    namespace: settings.namespace,
  });
}

export async function checkTemporalConnection(
  settings: TemporalRuntimeSettings,
  timeoutMs = 3_000,
): Promise<TemporalConnectionHealth> {
  const checkedAt = new Date().toISOString();
  let timeout: NodeJS.Timeout | null = null;

  try {
    await Promise.race([
      createTemporalClient(settings),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Temporal connection timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);

    return {
      checkedAt,
      detail: `Temporal reachable at ${settings.address}`,
      status: "online",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err, temporalAddress: settings.address },
      "Temporal connection check failed",
    );
    return {
      checkedAt,
      detail: message,
      status: "offline",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
