import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";

export interface SharedMemoryEntry {
  lastWriter: string;
  value: unknown;
  version: number;
}

export interface SharedMemoryStore {
  sharedMemoryNamespace?: {
    create?(args: unknown): Promise<unknown>;
    findFirst?(args: unknown): Promise<unknown | null>;
    findUnique?(args: unknown): Promise<unknown | null>;
    update?(args: unknown): Promise<unknown>;
  } | undefined;
}

function normalizeEntries(value: unknown): Record<string, SharedMemoryEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Record<string, SharedMemoryEntry> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<SharedMemoryEntry>;
    entries[key] = {
      lastWriter: String(record.lastWriter ?? "unknown"),
      value: record.value,
      version: Number.isFinite(Number(record.version)) ? Number(record.version) : 0,
    };
  }
  return entries;
}

function normalizeLockedKeys(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function ensureSharedMemoryNamespace({
  parentRunId,
  store = prisma,
}: {
  parentRunId: string;
  store?: SharedMemoryStore;
}) {
  if (!store.sharedMemoryNamespace?.findFirst || !store.sharedMemoryNamespace.create) return null;
  const existing = await store.sharedMemoryNamespace.findFirst({
    where: { parentRunId },
  }) as { id?: string } | null;
  if (existing?.id) return existing.id;

  const created = await store.sharedMemoryNamespace.create({
    data: {
      entries: {},
      lockedKeys: [],
      parentRunId,
    },
  }) as { id?: string };
  return created.id ?? null;
}

export async function readSharedMemoryKey({
  key,
  namespaceId,
  store = prisma,
}: {
  key: string;
  namespaceId: string;
  store?: SharedMemoryStore;
}) {
  if (!store.sharedMemoryNamespace?.findUnique) throw new Error("Shared memory store is not configured");
  const namespace = await store.sharedMemoryNamespace.findUnique({
    where: { id: namespaceId },
  }) as { entries?: unknown } | null;
  if (!namespace) throw new Error("Shared memory namespace not found");
  return normalizeEntries(namespace.entries)[key] ?? null;
}

export async function writeSharedMemoryKey({
  expectedVersion,
  key,
  namespaceId,
  store = prisma,
  value,
  writer,
}: {
  expectedVersion?: number;
  key: string;
  namespaceId: string;
  store?: SharedMemoryStore;
  value: unknown;
  writer: string;
}) {
  if (!store.sharedMemoryNamespace?.findUnique || !store.sharedMemoryNamespace.update) {
    throw new Error("Shared memory store is not configured");
  }
  const namespace = await store.sharedMemoryNamespace.findUnique({
    where: { id: namespaceId },
  }) as { entries?: unknown; lockedKeys?: unknown } | null;
  if (!namespace) throw new Error("Shared memory namespace not found");

  const lockedKeys = normalizeLockedKeys(namespace.lockedKeys);
  if (lockedKeys.includes(key)) {
    throw new Error(`Shared memory key "${key}" is locked`);
  }

  const entries = normalizeEntries(namespace.entries);
  const current = entries[key];
  if (expectedVersion !== undefined && (current?.version ?? 0) !== expectedVersion) {
    throw new Error(`Shared memory version conflict for "${key}"`);
  }

  const next: SharedMemoryEntry = {
    lastWriter: redactSecrets(writer),
    value: redactValue(value),
    version: (current?.version ?? 0) + 1,
  };
  const nextEntries = { ...entries, [key]: next };
  await store.sharedMemoryNamespace.update({
    data: { entries: nextEntries },
    where: { id: namespaceId },
  });
  return next;
}

export async function lockSharedMemoryKey({
  key,
  namespaceId,
  store = prisma,
}: {
  key: string;
  namespaceId: string;
  store?: SharedMemoryStore;
}) {
  if (!store.sharedMemoryNamespace?.findUnique || !store.sharedMemoryNamespace.update) {
    throw new Error("Shared memory store is not configured");
  }
  const namespace = await store.sharedMemoryNamespace.findUnique({
    where: { id: namespaceId },
  }) as { lockedKeys?: unknown } | null;
  if (!namespace) throw new Error("Shared memory namespace not found");
  const lockedKeys = new Set(normalizeLockedKeys(namespace.lockedKeys));
  lockedKeys.add(key);
  await store.sharedMemoryNamespace.update({
    data: { lockedKeys: [...lockedKeys] },
    where: { id: namespaceId },
  });
  return { locked: true };
}

export async function unlockSharedMemoryKey({
  key,
  namespaceId,
  store = prisma,
}: {
  key: string;
  namespaceId: string;
  store?: SharedMemoryStore;
}) {
  if (!store.sharedMemoryNamespace?.findUnique || !store.sharedMemoryNamespace.update) {
    throw new Error("Shared memory store is not configured");
  }
  const namespace = await store.sharedMemoryNamespace.findUnique({
    where: { id: namespaceId },
  }) as { lockedKeys?: unknown } | null;
  if (!namespace) throw new Error("Shared memory namespace not found");
  await store.sharedMemoryNamespace.update({
    data: { lockedKeys: normalizeLockedKeys(namespace.lockedKeys).filter((item) => item !== key) },
    where: { id: namespaceId },
  });
  return { unlocked: true };
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}
