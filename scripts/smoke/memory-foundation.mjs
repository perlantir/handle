#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const scenario = process.argv[2];
if (!scenario) {
  throw new Error("Usage: memory-foundation.mjs <scenario>");
}

if (scenario === "none-scope-skip-zep") {
  const logDir = await mkdtemp(join(tmpdir(), "handle-memory-log-"));
  process.env.HANDLE_LOG_DIR = logDir;
  const { appendMessageToZep, getRelevantMemoryForTask } = await import("../../apps/api/src/memory/sessionMemory.ts");
  await appendMessageToZep({
    content: "My favorite color is teal",
    project: { id: "memory-none-scope", memoryScope: "NONE" },
    role: "USER",
  });
  const recalled = await getRelevantMemoryForTask({
    goal: "What is my favorite color?",
    project: { id: "memory-none-scope", memoryScope: "NONE" },
    taskId: "memory-none-scope",
  });
  assert(recalled.length === 0, "NONE scope should recall no memory");
  const logPath = join(logDir, "memory.log");
  const log = await readFile(logPath, "utf8").catch(() => "");
  assert(!log.includes("memory.write") && !log.includes("memory.recall"), "NONE scope should not log Zep operations");
  await rm(logDir, { force: true, recursive: true });
  console.log("[memory-foundation:none-scope-skip-zep] PASS");
  process.exit(0);
}

const {
  appendMessageToZep,
  forgetMemoryForProject,
  getRelevantMemoryForTask,
  memorySessionIds,
} = await import("../../apps/api/src/memory/sessionMemory.ts");
const { getZepClient } = await import("../../apps/api/src/memory/zepClient.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function ensureZep() {
  const client = getZepClient();
  const status = await client.checkConnection();
  assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);
  return client;
}

async function activeMessages(client, sessionId) {
  const memory = await client.getSessionMemory({ sessionId });
  if (!memory.ok) {
    if (memory.detail?.includes("not found")) return [];
    throw new Error(memory.detail ?? `Could not read ${sessionId}`);
  }
  return (memory.value ?? []).filter((message) => typeof message.metadata?.invalid_at !== "string");
}

async function factMessages(client, project) {
  const session = memorySessionIds({ project }).find((item) => item.source === "project");
  assert(session, `No project session for ${project.id}`);
  return activeMessages(client, session.id);
}

async function globalMessages(client) {
  const session = memorySessionIds({
    project: { id: "global-probe", memoryScope: "GLOBAL_AND_PROJECT" },
  }).find((item) => item.source === "global");
  assert(session, "No global session id");
  return activeMessages(client, session.id);
}

async function assertProjectFacts(client, project, expected) {
  const messages = await factMessages(client, project);
  const contents = messages.map((message) => message.content);
  assert(
    contents.filter((content) => normalize(content) === normalize(expected)).length === 1,
    `Expected one "${expected}" in ${project.id}, got ${JSON.stringify(contents)}`,
  );
  return contents;
}

async function run() {
  const client = await ensureZep();
  const suffix = Date.now();

  if (scenario === "project-write-isolation") {
    const projects = ["a", "b", "c"].map((id) => ({
      id: `project-write-isolation-${id}-${suffix}`,
      memoryScope: "PROJECT_ONLY",
    }));
    const facts = [
      "My favorite color is teal",
      "My favorite season is autumn",
      "I drive a Tacoma",
    ];
    const expected = [
      "User's favorite color is teal.",
      "User's favorite season is autumn.",
      "User drives a Tacoma.",
    ];
    for (const [index, project] of projects.entries()) {
      await appendMessageToZep({
        content: facts[index],
        conversationId: `project-write-isolation-${index}-${suffix}`,
        project,
        role: "USER",
      });
    }
    await delay(1000);
    for (const [index, project] of projects.entries()) {
      const contents = await assertProjectFacts(client, project, expected[index]);
      for (const other of expected.filter((_, otherIndex) => otherIndex !== index)) {
        assert(!contents.some((content) => normalize(content) === normalize(other)), `${project.id} leaked ${other}`);
      }
    }
    const global = await globalMessages(client);
    assert(!global.some((message) => expected.some((fact) => normalize(message.content) === normalize(fact))), "PROJECT_ONLY write leaked to global");
    return;
  }

  if (scenario === "no-questions-as-facts" || scenario === "no-imperatives-as-facts") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "PROJECT_ONLY" };
    await appendMessageToZep({
      content: scenario === "no-questions-as-facts" ? "What's my favorite color?" : "Tell me a joke",
      conversationId: `${scenario}-conversation-${suffix}`,
      project,
      role: "USER",
    });
    await delay(500);
    const messages = await factMessages(client, project);
    assert(messages.length === 0, `Expected no project facts, got ${JSON.stringify(messages.map((message) => message.content))}`);
    return;
  }

  if (scenario === "declarative-extracts") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "PROJECT_ONLY" };
    await appendMessageToZep({
      content: "My favorite color is teal",
      conversationId: `${scenario}-conversation-${suffix}`,
      project,
      role: "USER",
    });
    await delay(500);
    await assertProjectFacts(client, project, "User's favorite color is teal.");
    return;
  }

  if (scenario === "remember-extraction" || scenario === "single-fact-per-statement") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "PROJECT_ONLY" };
    await appendMessageToZep({
      content: "Remember that I drive a 2018 Toyota Tacoma.",
      conversationId: `${scenario}-conversation-${suffix}`,
      project,
      role: "USER",
    });
    await delay(500);
    const contents = await assertProjectFacts(client, project, "User drives a 2018 Toyota Tacoma.");
    assert(contents.length === 1, `Expected exactly one project fact, got ${JSON.stringify(contents)}`);
    assert(!contents.some((content) => /^remember that/i.test(content)), "Raw remember text was stored as a fact");
    return;
  }

  if (scenario === "project-only-isolation-read") {
    const globalProject = { id: `global-writer-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
    const projectOnly = { id: `project-only-reader-${suffix}`, memoryScope: "PROJECT_ONLY" };
    const season = `winter-${suffix}`;
    await appendMessageToZep({
      content: `My favorite season is ${season}`,
      conversationId: `global-writer-conversation-${suffix}`,
      project: globalProject,
      role: "USER",
    });
    await delay(1000);
    const recalled = await getRelevantMemoryForTask({
      goal: "What is my favorite season?",
      project: projectOnly,
      taskId: `project-only-reader-run-${suffix}`,
    });
    assert(!recalled.some((item) => normalize(item.content).includes(season)), `PROJECT_ONLY recalled global fact: ${JSON.stringify(recalled)}`);
    return;
  }

  if (scenario === "forget-both-layers") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
    const color = `violet-${suffix}`;
    await appendMessageToZep({
      content: `My favorite color is ${color}`,
      conversationId: `${scenario}-conversation-${suffix}`,
      project,
      role: "USER",
    });
    await delay(500);
    const result = await forgetMemoryForProject({
      project,
      query: `User's favorite color is ${color}.`,
      scope: "project",
    });
    assert(result.touchedSessions >= 2, `Expected both layers touched, got ${result.touchedSessions}`);
    assert(result.deletedFacts >= 2, `Expected both facts deleted, got ${result.deletedFacts}`);
    const projectFacts = await factMessages(client, project);
    const globalFacts = await globalMessages(client);
    assert(!projectFacts.some((message) => message.content.includes(color)), "Project layer still has forgotten fact");
    assert(!globalFacts.some((message) => message.content.includes(color)), "Global layer still has forgotten fact");
    return;
  }

  if (scenario === "forget-only-matches") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "GLOBAL_AND_PROJECT" };
    const facts = [
      `My favorite color is teal-${suffix}`,
      `Remember that my project is named Handle-${suffix}`,
      `I drive a Honda Civic-${suffix}`,
      `My favorite season is spring-${suffix}`,
      `I prefer concise updates-${suffix}`,
    ];
    for (const [index, content] of facts.entries()) {
      await appendMessageToZep({
        content,
        conversationId: `${scenario}-conversation-${suffix}-${index}`,
        project,
        role: "USER",
      });
    }
    await delay(1000);
    const result = await forgetMemoryForProject({
      project,
      query: `User drives a Honda Civic-${suffix}.`,
      scope: "all",
    });
    assert(result.touchedSessions === 2, `Expected 2 touched sessions, got ${result.touchedSessions}`);
    assert(result.deletedFacts === 2, `Expected one fact from each layer deleted, got ${result.deletedFacts}`);
    const projectFacts = await factMessages(client, project);
    const globalFacts = await globalMessages(client);
    const allFacts = [...projectFacts, ...globalFacts].map((message) => message.content);
    assert(!allFacts.some((content) => content.includes(`Honda Civic-${suffix}`)), `Forgotten car fact remains: ${JSON.stringify(allFacts)}`);
    for (const expected of [
      `teal-${suffix}`,
      `Handle-${suffix}`,
      `spring-${suffix}`,
      `concise updates-${suffix}`,
    ]) {
      assert(
        projectFacts.some((message) => message.content.includes(expected)),
        `Project layer lost unrelated fact ${expected}: ${JSON.stringify(projectFacts.map((message) => message.content))}`,
      );
      assert(
        globalFacts.some((message) => message.content.includes(expected)),
        `Global layer lost unrelated fact ${expected}: ${JSON.stringify(globalFacts.map((message) => message.content))}`,
      );
    }
    return;
  }

  if (scenario === "redaction-skips-write") {
    const project = { id: `${scenario}-${suffix}`, memoryScope: "PROJECT_ONLY" };
    await appendMessageToZep({
      content: `My new API key is sk-${"x".repeat(30)}`,
      conversationId: `${scenario}-conversation-${suffix}`,
      project,
      role: "USER",
    });
    await appendMessageToZep({
      content: "User's API key is [REDACTED].",
      conversationId: `${scenario}-explicit-conversation-${suffix}`,
      extractionMode: "explicit_fact",
      project,
      role: "USER",
    });
    await delay(500);
    const projectFacts = await factMessages(client, project);
    assert(projectFacts.length === 0, `Expected no redacted project fact, got ${JSON.stringify(projectFacts.map((message) => message.content))}`);
    assert(!JSON.stringify(projectFacts).includes("[REDACTED]"), "Redacted marker should not be stored as a fact");
    const conversationSession = memorySessionIds({ conversationId: `${scenario}-conversation-${suffix}`, project }).find((item) => item.source === "conversation");
    assert(conversationSession, "No conversation session");
    const conversation = await activeMessages(client, conversationSession.id);
    assert(JSON.stringify(conversation).includes("[REDACTED]"), "Conversation history should keep redacted content");
    return;
  }

  throw new Error(`Unknown memory foundation scenario: ${scenario}`);
}

run()
  .then(() => {
    console.log(`[memory-foundation:${scenario}] PASS`);
  })
  .catch((error) => {
    console.error(`[memory-foundation:${scenario}] FAIL ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  });
