#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import {
  appendMessageToZep,
  getRelevantMemoryForTask,
} from "../../apps/api/src/memory/sessionMemory.ts";
import { getZepClient } from "../../apps/api/src/memory/zepClient.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now();
const projectA = { id: `memory-project-a-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
const projectB = { id: `memory-project-b-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
const projectC = { id: `memory-project-c-${suffix}`, memoryScope: "PROJECT_ONLY" };
const fact = `My favorite color is teal-${suffix}`;

console.log("[memory-recall] checking Zep connection");
const client = getZepClient();
const status = await client.checkConnection();
assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

console.log("[memory-recall] writing fact to project A/global memory");
await appendMessageToZep({
  content: fact,
  conversationId: `conversation-a-${suffix}`,
  project: projectA,
  role: "USER",
});

await delay(1000);

console.log("[memory-recall] recalling in same project");
const sameProject = await getRelevantMemoryForTask({
  goal: "What is my favorite color?",
  project: projectA,
  taskId: `run-a-${suffix}`,
});
assert(
  sameProject.some((item) => item.content.includes(fact)),
  "Same project did not recall written fact",
);

console.log("[memory-recall] recalling from global memory in different project");
const globalProject = await getRelevantMemoryForTask({
  goal: "What is my favorite color?",
  project: projectB,
  taskId: `run-b-${suffix}`,
});
assert(
  globalProject.some((item) => item.content.includes(fact)),
  "GLOBAL_AND_PROJECT project did not recall global fact",
);

console.log("[memory-recall] verifying project-only isolation");
const projectOnly = await getRelevantMemoryForTask({
  goal: "What is my favorite color?",
  project: projectC,
  taskId: `run-c-${suffix}`,
});
assert(
  !projectOnly.some((item) => item.content.includes(fact)),
  "PROJECT_ONLY project unexpectedly recalled global fact",
);

console.log("[memory-recall] PASS");
