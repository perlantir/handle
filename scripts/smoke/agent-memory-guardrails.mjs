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

throw new Error(`Unknown agent memory guardrail scenario: ${scenario}`);
