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
const project = { id: `memory-no-assistant-facts-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
const conversationId = `memory-no-assistant-facts-${suffix}`;
const userFact = `My favorite color is teal-${suffix}`;
const assistantReply =
  `Got it — teal it is for assistant-fact-smoke-${suffix}! I already have that saved in memory from before, so no need to re-save it.`;

console.log("[memory-no-assistant-facts] checking Zep connection");
const client = getZepClient();
const status = await client.checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-no-assistant-facts] writing user fact");
await appendMessageToZep({
  content: userFact,
  conversationId,
  project,
  role: "USER",
});

console.log("[memory-no-assistant-facts] writing assistant response");
await appendMessageToZep({
  content: assistantReply,
  conversationId,
  project,
  role: "ASSISTANT",
});

await delay(1000);

const sessions = memorySessionIds({ conversationId, project });
const globalAndProjectSessions = sessions.filter((session) => session.source !== "conversation");
const conversationSession = sessions.find((session) => session.source === "conversation");
assert(conversationSession, "Conversation session was not created");

for (const session of globalAndProjectSessions) {
  const stored = await client.getSessionMemory({ sessionId: session.id });
  assert(stored.ok, stored.detail ?? `Could not read ${session.id}`);
  const serialized = JSON.stringify(stored.value ?? []);
  assert(serialized.includes(userFact), `${session.id} did not store user fact`);
  assert(!serialized.includes(assistantReply), `${session.id} stored assistant response as fact`);
}

const conversation = await client.getSessionMemory({ sessionId: conversationSession.id });
assert(conversation.ok, conversation.detail ?? "Could not read conversation session");
const conversationSerialized = JSON.stringify(conversation.value ?? []);
assert(conversationSerialized.includes(userFact), "Conversation session omitted user fact");
assert(conversationSerialized.includes(assistantReply), "Conversation session omitted assistant history");

console.log("[memory-no-assistant-facts] PASS");
