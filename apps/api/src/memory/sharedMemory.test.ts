import { describe, expect, it, vi } from "vitest";
import {
  ensureSharedMemoryNamespace,
  lockSharedMemoryKey,
  readSharedMemoryKey,
  unlockSharedMemoryKey,
  writeSharedMemoryKey,
} from "./sharedMemory";

describe("sharedMemory", () => {
  it("creates a namespace and reads/writes versioned values", async () => {
    let namespace = {
      entries: {},
      id: "namespace-1",
      lockedKeys: [],
      parentRunId: "run-1",
    };
    const store = {
      sharedMemoryNamespace: {
        create: vi.fn(async ({ data }: { data: typeof namespace }) => {
          namespace = { ...data, id: "namespace-1" };
          return namespace;
        }),
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => namespace),
        update: vi.fn(async ({ data }: { data: Partial<typeof namespace> }) => {
          namespace = { ...namespace, ...data };
          return namespace;
        }),
      },
    };

    await expect(ensureSharedMemoryNamespace({ parentRunId: "run-1", store })).resolves.toBe("namespace-1");
    const first = await writeSharedMemoryKey({
      key: "plan",
      namespaceId: "namespace-1",
      store,
      value: { step: 1 },
      writer: "worker-a",
    });
    expect(first.version).toBe(1);
    await expect(
      writeSharedMemoryKey({
        expectedVersion: 0,
        key: "plan",
        namespaceId: "namespace-1",
        store,
        value: { step: 2 },
        writer: "worker-b",
      }),
    ).rejects.toThrow(/version conflict/);
    await expect(readSharedMemoryKey({ key: "plan", namespaceId: "namespace-1", store })).resolves.toMatchObject({
      lastWriter: "worker-a",
      version: 1,
    });
  });

  it("prevents writes while a key is locked", async () => {
    let namespace = {
      entries: {},
      id: "namespace-1",
      lockedKeys: [] as string[],
    };
    const store = {
      sharedMemoryNamespace: {
        findUnique: vi.fn(async () => namespace),
        update: vi.fn(async ({ data }: { data: Partial<typeof namespace> }) => {
          namespace = { ...namespace, ...data };
          return namespace;
        }),
      },
    };

    await lockSharedMemoryKey({ key: "plan", namespaceId: "namespace-1", store });
    await expect(
      writeSharedMemoryKey({
        key: "plan",
        namespaceId: "namespace-1",
        store,
        value: "new plan",
        writer: "worker-b",
      }),
    ).rejects.toThrow(/locked/);
    await unlockSharedMemoryKey({ key: "plan", namespaceId: "namespace-1", store });
    await expect(
      writeSharedMemoryKey({
        key: "plan",
        namespaceId: "namespace-1",
        store,
        value: "new plan",
        writer: "worker-b",
      }),
    ).resolves.toMatchObject({ version: 1 });
  });
});
