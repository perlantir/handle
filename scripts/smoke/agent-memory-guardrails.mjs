#!/usr/bin/env node
const scenario = process.argv[2];
if (!scenario) throw new Error("Usage: agent-memory-guardrails.mjs <scenario>");

const { parseAgentFinalResult } = await import("../../apps/api/src/agent/finalResult.ts");
const { buildHandleSystemPrompt } = await import("../../apps/api/src/agent/prompts.ts");
const { redactSecretsWithReport } = await import("../../apps/api/src/lib/redact.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (scenario === "no-confabulation-empty-memory") {
  const prompt = buildHandleSystemPrompt({
    memoryContext: "<memory_context>None recalled</memory_context>",
  });
  assert(prompt.includes("<memory_context>None recalled</memory_context>"), "Prompt omitted explicit empty-memory marker");
  assert(prompt.includes("Do not claim to remember"), "Prompt omitted anti-confabulation instruction");
  assert(prompt.includes("already saved"), "Prompt omitted banned memory phrase guidance");
  console.log("[agent-memory-guardrails:no-confabulation-empty-memory] PASS");
  process.exit(0);
}

if (scenario === "redaction-no-response-crash") {
  const input = `My new API key is sk-${"a".repeat(30)}`;
  const redacted = redactSecretsWithReport(input);
  assert(redacted.redactionTriggered, "API-key-shaped input was not redacted");
  const result = parseAgentFinalResult(
    `I notice you shared an API-key-shaped value, so I will not save it in memory.\n[[HANDLE_RESULT:SUCCESS]]`,
  );
  assert(result.success, "Natural language redaction response should parse as success");
  assert(!result.message.includes(`sk-${"a".repeat(30)}`), "Parsed response leaked secret-shaped input");
  console.log("[agent-memory-guardrails:redaction-no-response-crash] PASS");
  process.exit(0);
}

if (scenario === "no-misleading-secret-confirmation") {
  const { createMemoryToolDefinitions } = await import("../../apps/api/src/agent/memoryTools.ts");
  const { memorySessionIds } = await import("../../apps/api/src/memory/sessionMemory.ts");
  const { getZepClient } = await import("../../apps/api/src/memory/zepClient.ts");

  const client = getZepClient();
  const status = await client.checkConnection();
  assert(status.status === "online", `Zep is not online: ${status.detail ?? "unknown"}`);

  const suffix = Date.now();
  const project = {
    id: `no-misleading-secret-confirmation-${suffix}`,
    memoryScope: "PROJECT_ONLY",
  };
  const save = createMemoryToolDefinitions().find((tool) => tool.name === "memory_save");
  assert(save, "memory_save tool missing");

  const result = await save.implementation(
    { fact: "User's API key is [REDACTED]." },
    {
      backend: {
        id: "local",
        async browserSession() {
          throw new Error("not used");
        },
        async fileDelete() {},
        async fileList() {
          return [];
        },
        async fileRead() {
          return "";
        },
        async fileWrite() {},
        getWorkspaceDir() {
          return `/tmp/${project.id}`;
        },
        async initialize() {},
        async shellExec() {
          return { exitCode: 0, stderr: "", stdout: "" };
        },
        async shutdown() {},
      },
      conversationId: `${project.id}-conversation`,
      memoryProject: project,
      projectId: project.id,
      taskId: `${project.id}-run`,
    },
  );

  assert(result.includes("Secret-shaped content was blocked"), `Expected blocked-secret response, got: ${result}`);
  assert(result.includes("did not keep"), `Expected explicit not-kept response, got: ${result}`);
  assert(!/(securely stored|saved|memorized|updated and saved|stored in memory)/i.test(result), `Misleading secret confirmation: ${result}`);

  const paraphraseResult = await save.implementation(
    { fact: "User has an API key (not stored; redacted/secret)." },
    {
      backend: {
        id: "local",
        async browserSession() {
          throw new Error("not used");
        },
        async fileDelete() {},
        async fileList() {
          return [];
        },
        async fileRead() {
          return "";
        },
        async fileWrite() {},
        getWorkspaceDir() {
          return `/tmp/${project.id}`;
        },
        async initialize() {},
        async shellExec() {
          return { exitCode: 0, stderr: "", stdout: "" };
        },
        async shutdown() {},
      },
      conversationId: `${project.id}-conversation`,
      memoryProject: project,
      projectId: project.id,
      taskId: `${project.id}-run`,
    },
  );
  assert(
    paraphraseResult.includes("Secret-shaped content was blocked"),
    `Expected blocked secret-topic response, got: ${paraphraseResult}`,
  );

  const projectSession = memorySessionIds({ project }).find((item) => item.source === "project");
  assert(projectSession, "No project session");
  const memory = await client.getSessionMemory({ sessionId: projectSession.id });
  const contents = memory.ok && memory.value ? memory.value.map((message) => message.content) : [];
  assert(!contents.some((content) => content.includes("[REDACTED]")), `Redacted fact was stored: ${JSON.stringify(contents)}`);
  assert(!contents.some((content) => /api\s*key/i.test(content)), `Secret-topic fact was stored: ${JSON.stringify(contents)}`);

  console.log("[agent-memory-guardrails:no-misleading-secret-confirmation] PASS");
  process.exit(0);
}

throw new Error(`Unknown agent memory guardrail scenario: ${scenario}`);
