#!/usr/bin/env node
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });

const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const {
  ensureSharedMemoryNamespace,
  lockSharedMemoryKey,
  readSharedMemoryKey,
  unlockSharedMemoryKey,
  writeSharedMemoryKey,
} = await import("../../apps/api/src/memory/sharedMemory.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = await prisma.project.create({
  data: { id: `shared-memory-project-${suffix}`, name: `Shared Memory Smoke ${suffix}` },
});
const conversation = await prisma.conversation.create({
  data: { projectId: project.id, title: "Shared memory primitive" },
});
const run = await prisma.agentRun.create({
  data: {
    conversationId: conversation.id,
    goal: "Shared memory primitive smoke",
    status: "RUNNING",
  },
});

console.log("[shared-memory-primitive] creating namespace");
const namespaceId = await ensureSharedMemoryNamespace({ parentRunId: run.id });
assert(namespaceId, "Namespace was not created");

console.log("[shared-memory-primitive] writing first value");
const first = await writeSharedMemoryKey({
  key: "plan",
  namespaceId,
  value: { step: "draft" },
  writer: "client-a",
});
assert(first.version === 1, `Expected version 1, got ${first.version}`);

console.log("[shared-memory-primitive] checking optimistic conflict");
let conflict = false;
try {
  await writeSharedMemoryKey({
    expectedVersion: 0,
    key: "plan",
    namespaceId,
    value: { step: "stale" },
    writer: "client-b",
  });
} catch {
  conflict = true;
}
assert(conflict, "Expected stale write to conflict");

console.log("[shared-memory-primitive] checking lock");
await lockSharedMemoryKey({ key: "plan", namespaceId });
let locked = false;
try {
  await writeSharedMemoryKey({
    key: "plan",
    namespaceId,
    value: { step: "locked write" },
    writer: "client-b",
  });
} catch {
  locked = true;
}
assert(locked, "Expected locked key write to fail");

await unlockSharedMemoryKey({ key: "plan", namespaceId });
const second = await writeSharedMemoryKey({
  expectedVersion: 1,
  key: "plan",
  namespaceId,
  value: { step: "approved" },
  writer: "client-b",
});
assert(second.version === 2, `Expected version 2, got ${second.version}`);

const readBack = await readSharedMemoryKey({ key: "plan", namespaceId });
assert(readBack?.lastWriter === "client-b", "Read back did not include latest writer");

console.log("[shared-memory-primitive] PASS");
