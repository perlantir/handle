#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import {
  appendMessageToZep,
  memorySessionIds,
} from "../../apps/api/src/memory/sessionMemory.ts";
import { getZepClient } from "../../apps/api/src/memory/zepClient.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = { id: `memory-redaction-${suffix}`, memoryScope: "PROJECT_ONLY" };
const conversationId = `memory-redaction-conversation-${suffix}`;
const sensitive = [
  "card 4111-1111-1111-1111",
  "ssn 123-45-6789",
  `api sk-${"r".repeat(30)}`,
].join(" ");

console.log("[memory-redaction] checking Zep connection");
const client = getZepClient();
const status = await client.checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-redaction] writing sensitive-shaped message");
await appendMessageToZep({
  content: sensitive,
  conversationId,
  project,
  role: "USER",
});

await delay(1000);

console.log("[memory-redaction] reading stored memory directly");
const session = memorySessionIds({ conversationId, project }).find((item) => item.source === "conversation");
assert(session, "Conversation session was not created");
const stored = await client.getSessionMemory({ sessionId: session.id });
assert(stored.ok, stored.detail ?? "Could not read stored memory");
const serialized = JSON.stringify(stored.value ?? []);

assert(!serialized.includes("4111-1111-1111-1111"), "Credit card number was stored in Zep");
assert(!serialized.includes("123-45-6789"), "SSN was stored in Zep");
assert(!serialized.includes(`sk-${"r".repeat(30)}`), "API key was stored in Zep");
assert(serialized.includes("[REDACTED]"), "Stored memory did not include redaction marker");

console.log("[memory-redaction] PASS");
