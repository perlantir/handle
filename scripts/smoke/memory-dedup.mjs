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

function normalized(content) {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

const suffix = Date.now();
const project = { id: `memory-dedup-${suffix}`, memoryScope: "PROJECT_ONLY" };
const conversationId = `memory-dedup-${suffix}`;
const fact = "My favorite color is teal";
const normalizedFact = "User's favorite color is teal.";

console.log("[memory-dedup] checking Zep connection");
const client = getZepClient();
const status = await client.checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-dedup] writing duplicate fact five times");
for (let index = 0; index < 5; index += 1) {
  await appendMessageToZep({
    content: fact,
    conversationId,
    project,
    role: "USER",
  });
}

await delay(1000);

const sessions = memorySessionIds({ conversationId, project });
const projectSession = sessions.find((session) => session.source === "project");
const conversationSession = sessions.find((session) => session.source === "conversation");
assert(projectSession, "Project memory session was not created");
assert(conversationSession, "Conversation session was not created");

const projectMemory = await client.getSessionMemory({ sessionId: projectSession.id });
assert(projectMemory.ok, projectMemory.detail ?? "Could not read project memory");
const duplicateFacts = (projectMemory.value ?? []).filter(
  (message) =>
    normalized(message.content) === normalized(normalizedFact) &&
    typeof message.metadata?.invalid_at !== "string",
);
assert(
  duplicateFacts.length === 1,
  `Expected one active project fact, found ${duplicateFacts.length}`,
);

const conversation = await client.getSessionMemory({ sessionId: conversationSession.id });
assert(conversation.ok, conversation.detail ?? "Could not read conversation memory");
const conversationFacts = (conversation.value ?? []).filter(
  (message) => normalized(message.content) === normalized(fact),
);
assert(
  conversationFacts.length === 5,
  `Expected conversation history to keep five messages, found ${conversationFacts.length}`,
);

console.log("[memory-dedup] PASS");
