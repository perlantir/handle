#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import {
  appendMessageToZep,
  formatMemoryContext,
  getRelevantMemoryForTask,
  memorySessionIds,
} from "../../apps/api/src/memory/sessionMemory.ts";
import { getZepClient } from "../../apps/api/src/memory/zepClient.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = { id: `memory-bitemporal-${suffix}`, memoryScope: "PROJECT_ONLY" };
const conversationId = `memory-bitemporal-conversation-${suffix}`;

console.log("[memory-bitemporal] checking Zep connection");
const client = getZepClient();
const status = await client.checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-bitemporal] writing Chicago residence fact");
await appendMessageToZep({
  content: "I live in Chicago",
  conversationId,
  project,
  role: "USER",
  validAt: "2026-01-01T00:00:00.000Z",
});

await delay(500);

console.log("[memory-bitemporal] writing Austin superseding residence fact");
await appendMessageToZep({
  content: "I moved to Austin",
  conversationId,
  project,
  role: "USER",
  validAt: "2026-03-15T00:00:00.000Z",
});

await delay(1000);

console.log("[memory-bitemporal] verifying direct metadata");
const projectSession = memorySessionIds({ conversationId, project }).find((item) => item.source === "project");
assert(projectSession, "Project memory session was not created");
const stored = await client.getSessionMemory({ sessionId: projectSession.id });
assert(stored.ok, stored.detail ?? "Could not read project memory");
const messages = stored.value ?? [];
const chicago = messages.find((item) => item.content.includes("Chicago"));
const austin = messages.find((item) => item.content.includes("Austin"));

assert(chicago, "Chicago fact missing");
assert(austin, "Austin fact missing");
assert(chicago.metadata?.invalid_at === "2026-03-15T00:00:00.000Z", "Chicago fact was not marked historical");
assert(austin.metadata?.valid_at === "2026-03-15T00:00:00.000Z", "Austin fact valid_at missing");
assert(!austin.metadata?.invalid_at, "Austin current fact should not have invalid_at");

console.log("[memory-bitemporal] verifying recall context formatting");
const recalled = await retryRecall({
  goal: "Where do I live now?",
  project,
  taskId: `memory-bitemporal-run-${suffix}`,
});
const context = formatMemoryContext(recalled);
assert(context.includes("valid since") || context.includes("valid 2026-01-01 to 2026-03-15"), "Memory context omitted validity labels");

console.log("[memory-bitemporal] PASS");

async function retryRecall(input, attempts = 6) {
  let last = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await getRelevantMemoryForTask(input);
    if (last.length > 0) return last;
    await delay(1000);
  }
  return last;
}
