#!/usr/bin/env node
import { getZepClient } from "../../apps/api/src/memory/zepClient.ts";

const dryRun = process.argv.includes("--dry-run");

const WHOLE_SESSION_PATTERNS = [
  /^conv_conversation-a-\d{13}$/,
  /^conv_memory-bitemporal-conversation-\d{13}$/,
  /^conv_memory-dedup-\d{13}$/,
  /^conv_memory-no-assistant-facts-\d{13}$/,
  /^conv_memory-redaction-conversation-\d{13}$/,
  /^conv_memory-tools-conversation-\d{13}$/,
  /^project_memory-bitemporal-\d{13}$/,
  /^project_memory-dedup-\d{13}$/,
  /^project_memory-no-assistant-facts-\d{13}$/,
  /^project_memory-project-[abc]-\d{13}$/,
  /^project_memory-redaction-\d{13}$/,
  /^project_memory-tools-\d{13}$/,
];

const SMOKE_CONTENT_PATTERNS = [
  /\bMy favorite color is teal-\d{13}\b/i,
  /\bMemory tools smoke fact \d{13}\b/i,
  /^Actually answer this follow-up instead\.$/i,
  /\bGot it — teal it is! I already have that saved in memory from before\b/i,
  /^Run first on E2B$/i,
  /^Run next on Local Mac$/i,
  /^Smoke e2e task: emit one tool call and finish\.$/i,
  /\bcard \[REDACTED\] ssn \[REDACTED\] api \[REDACTED\]\b/i,
];

function shouldDeleteWholeSession(sessionId) {
  return WHOLE_SESSION_PATTERNS.some((pattern) => pattern.test(sessionId));
}

function shouldRemoveMessage(sessionId, message) {
  const source = sessionId.startsWith("global_")
    ? "global"
    : sessionId.startsWith("project_")
      ? "project"
      : sessionId.startsWith("conv_")
        ? "conversation"
        : "unknown";
  if (source === "conversation") return false;
  const metadataRole = typeof message.metadata?.role === "string" ? message.metadata.role : null;
  if ((source === "global" || source === "project") && (message.role === "assistant" || metadataRole === "ASSISTANT")) {
    return true;
  }
  return SMOKE_CONTENT_PATTERNS.some((pattern) => pattern.test(message.content));
}

async function main() {
  const client = getZepClient();
  console.log(`[memory:reset-smoke-data] checking Zep connection (${dryRun ? "dry-run" : "apply"})`);
  const status = await client.checkConnection();
  if (status.status !== "online") {
    throw new Error(`Zep is not online: ${status.detail ?? "unknown"}`);
  }

  const listed = await client.listSessions();
  if (!listed.ok || !listed.value) {
    throw new Error(listed.detail ?? "Could not list Zep sessions");
  }

  let sessionsCleared = 0;
  let sessionsRewritten = 0;
  let messagesRemoved = 0;

  for (const session of listed.value) {
    if (shouldDeleteWholeSession(session.sessionId)) {
      const memory = await client.getSessionMemory({ sessionId: session.sessionId });
      const count = memory.ok && memory.value ? memory.value.length : 0;
      if (count === 0) continue;
      console.log(
        `[memory:reset-smoke-data] ${dryRun ? "would clear" : "clearing"} ${session.sessionId} (${count} messages)`,
      );
      sessionsCleared += 1;
      messagesRemoved += count;
      if (!dryRun) {
        const deleted = await client.deleteSessionMemory({ sessionId: session.sessionId });
        if (!deleted.ok) throw new Error(deleted.detail ?? `Could not clear ${session.sessionId}`);
      }
      continue;
    }

    const memory = await client.getSessionMemory({ sessionId: session.sessionId });
    if (!memory.ok) {
      console.warn(
        `[memory:reset-smoke-data] skipping ${session.sessionId}: ${memory.detail ?? "read failed"}`,
      );
      continue;
    }
    const messages = memory.value ?? [];
    if (messages.length === 0) continue;

    const kept = dedupeProjectFactMessages(
      session.sessionId,
      messages.filter((message) => !shouldRemoveMessage(session.sessionId, message)),
    );
    const removed = messages.length - kept.length;
    if (removed === 0) continue;

    console.log(
      `[memory:reset-smoke-data] ${dryRun ? "would rewrite" : "rewriting"} ${session.sessionId} (remove ${removed}, keep ${kept.length})`,
    );
    sessionsRewritten += 1;
    messagesRemoved += removed;
    if (!dryRun) {
      const deleted = await client.deleteSessionMemory({ sessionId: session.sessionId });
      if (!deleted.ok) throw new Error(deleted.detail ?? `Could not rewrite ${session.sessionId}`);
      if (kept.length > 0) {
        const added = await client.addMemoryMessages({
          messages: kept,
          sessionId: session.sessionId,
        });
        if (!added.ok) throw new Error(added.detail ?? `Could not restore ${session.sessionId}`);
      }
    }
  }

  console.log(
    `[memory:reset-smoke-data] PASS ${dryRun ? "would remove" : "removed"} ${messagesRemoved} messages across ${sessionsCleared} cleared sessions and ${sessionsRewritten} rewritten sessions`,
  );
}

function dedupeProjectFactMessages(sessionId, messages) {
  if (!sessionId.startsWith("global_") && !sessionId.startsWith("project_")) return messages;

  const seen = new Set();
  return messages.filter((message) => {
    if (typeof message.metadata?.invalid_at === "string") return true;
    const key = message.content.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

main().catch((error) => {
  console.error(`[memory:reset-smoke-data] FAIL ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
