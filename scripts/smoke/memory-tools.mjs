#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import {
  appendMessageToZep,
  forgetMemoryForProject,
  getRelevantMemoryForTask,
} from "../../apps/api/src/memory/sessionMemory.ts";
import { getZepClient } from "../../apps/api/src/memory/zepClient.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const project = { id: `memory-tools-${suffix}`, memoryScope: "PROJECT_ONLY" };
const fact = `My favorite memory tools color is teal-${suffix}`;
const expectedMarker = `teal-${suffix}`;
const forgetQuery = `User's favorite memory tools color is ${expectedMarker}.`;

console.log("[memory-tools] checking Zep connection");
const status = await getZepClient().checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-tools] saving fact");
await appendMessageToZep({
  content: fact,
  conversationId: `memory-tools-conversation-${suffix}`,
  extractionMode: "explicit_fact",
  project,
  role: "USER",
});

console.log("[memory-tools] searching fact");
const beforeForget = await retryRecall({
  goal: "favorite memory tools color",
  project,
  taskId: `memory-tools-run-${suffix}`,
});
assert(
  beforeForget.some((item) => item.content.includes(expectedMarker)),
  `Saved fact was not found: ${JSON.stringify(beforeForget)}`,
);

console.log("[memory-tools] simulating approved forget and deleting matching project fact");
const forget = await forgetMemoryForProject({ project, query: forgetQuery, scope: "project" });
assert(forget.deletedFacts >= 1, "Forget did not delete a matching memory fact");
await delay(1000);

console.log("[memory-tools] verifying fact is forgotten");
const afterForget = await getRelevantMemoryForTask({
  goal: "favorite memory tools color",
  project,
  taskId: `memory-tools-after-forget-${suffix}`,
});
assert(!afterForget.some((item) => item.content.includes(expectedMarker)), "Forgotten fact is still searchable");

console.log("[memory-tools] PASS");

async function retryRecall(input, attempts = 6) {
  let last = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await getRelevantMemoryForTask(input);
    if (last.some((item) => item.content.includes(expectedMarker))) return last;
    await delay(1000);
  }
  return last;
}
