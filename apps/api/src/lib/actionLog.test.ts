import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actionLogPath,
  appendActionLog,
  listActionLogEntries,
  recentActionLogContext,
  undoActionLogEntry,
} from "./actionLog";

const originalLogDir = process.env.HANDLE_LOG_DIR;

async function makeLogDir() {
  const dir = await mkdtemp(join(tmpdir(), "handle-action-log-test-"));
  process.env.HANDLE_LOG_DIR = dir;
  return dir;
}

describe("actionLog", () => {
  beforeEach(async () => {
    await makeLogDir();
  });

  afterEach(() => {
    if (originalLogDir === undefined) {
      delete process.env.HANDLE_LOG_DIR;
    } else {
      process.env.HANDLE_LOG_DIR = originalLogDir;
    }
  });

  it("appends redacted JSONL entries and lists newest first", async () => {
    const openAiKey = `sk-${"a".repeat(30)}`;
    const githubToken = `ghp_${"a".repeat(26)}`;
    await appendActionLog({
      conversationId: "conversation-1",
      description: `Created file with ${openAiKey}`,
      metadata: { note: `token ${githubToken}` },
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: true,
      target: "/tmp/example.txt",
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
      undoCommand: "rm /tmp/example.txt",
    });
    await appendActionLog({
      conversationId: "conversation-1",
      description: "Ran shell command: echo ok",
      metadata: { exitCode: 0 },
      outcomeType: "shell_command_executed",
      projectId: "project-1",
      reversible: false,
      target: "echo ok",
      taskId: "run-1",
      timestamp: "2026-05-02T12:01:00.000Z",
    });

    const raw = await readFile(actionLogPath(), "utf8");
    expect(raw).toContain("[REDACTED]");
    expect(raw).not.toContain(githubToken);

    const entries = await listActionLogEntries();
    expect(entries.map((entry) => entry.outcomeType)).toEqual([
      "shell_command_executed",
      "file_created",
    ]);
  });

  it("undoes reversible file creation and records file deletion", async () => {
    const file = join(process.env.HANDLE_LOG_DIR ?? tmpdir(), "created.txt");
    await writeFile(file, "hello", "utf8");
    await appendActionLog({
      conversationId: "conversation-1",
      description: `Created file ${file}`,
      metadata: {},
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: true,
      target: file,
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
      undoCommand: `rm '${file}'`,
    });

    await undoActionLogEntry("0");

    const entries = await listActionLogEntries();
    expect(entries[0]).toMatchObject({
      metadata: { undoOf: "0" },
      outcomeType: "file_deleted",
      target: file,
    });
  });

  it("formats recent actions for agent context", async () => {
    await appendActionLog({
      conversationId: "conversation-1",
      description: "Created file /tmp/a.txt",
      metadata: {},
      outcomeType: "file_created",
      projectId: "project-1",
      reversible: true,
      target: "/tmp/a.txt",
      taskId: "run-1",
      timestamp: "2026-05-02T12:00:00.000Z",
      undoCommand: "rm /tmp/a.txt",
    });

    const context = await recentActionLogContext({ conversationId: "conversation-1" });
    expect(context).toContain("<recent_actions>");
    expect(context).toContain("Created file /tmp/a.txt");
  });
});
