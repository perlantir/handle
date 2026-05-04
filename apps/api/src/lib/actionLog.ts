import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import readline from "node:readline";
import { redactSecrets } from "./redact";

export type ActionOutcomeType =
  | "browser_navigated"
  | "file_created"
  | "file_deleted"
  | "file_modified"
  | "integration_action"
  | "memory_forgotten"
  | "memory_saved"
  | "shell_command_executed";

export interface ActionLogEntry {
  timestamp: string;
  taskId: string;
  conversationId: string;
  projectId: string;
  outcomeType: ActionOutcomeType;
  description: string;
  target: string;
  metadata: Record<string, unknown>;
  reversible: boolean;
  undoCommand?: string;
}

export interface ActionLogSummary extends ActionLogEntry {
  id: string;
}

export function actionLogPath() {
  return join(process.env.HANDLE_LOG_DIR ?? join(homedir(), "Library", "Logs", "Handle"), "actions.log");
}

export async function appendActionLog(entry: ActionLogEntry) {
  const path = actionLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(redactActionEntry(entry))}\n`, "utf8");
}

export async function listActionLogEntries(limit = 500): Promise<ActionLogSummary[]> {
  const path = actionLogPath();
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return [];
  const lines = content.split("\n").filter(Boolean);
  return lines
    .map((line, index) => parseActionLine(line, index))
    .filter((entry): entry is ActionLogSummary => entry !== null)
    .slice(-limit)
    .reverse();
}

export async function findActionLogEntry(id: string) {
  const entries = await listActionLogEntries(Number.MAX_SAFE_INTEGER);
  return entries.find((entry) => entry.id === id) ?? null;
}

export async function undoActionLogEntry(id: string) {
  const entry = await findActionLogEntry(id);
  if (!entry) throw new Error("Action log entry not found");
  if (!entry.reversible || !entry.undoCommand) {
    throw new Error("Action is not reversible");
  }
  if (entry.outcomeType !== "file_created" || !entry.undoCommand.startsWith("rm ")) {
    throw new Error("Only workspace file creation undo is supported in Phase 5");
  }

  await rm(entry.target, { force: true });
  await appendActionLog({
    conversationId: entry.conversationId,
    description: `Deleted file ${entry.target}`,
    metadata: { undoOf: entry.id },
    outcomeType: "file_deleted",
    projectId: entry.projectId,
    reversible: false,
    target: entry.target,
    taskId: entry.taskId,
    timestamp: new Date().toISOString(),
  });
  return { undone: true };
}

export async function tailActionLog(limit = 10) {
  const path = actionLogPath();
  const content = await readFile(path, "utf8").catch(() => "");
  if (!content.trim()) return [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ crlfDelay: Infinity, input: stream });
  const entries: ActionLogSummary[] = [];
  let index = 0;
  for await (const line of rl) {
    const parsed = parseActionLine(line, index);
    if (parsed) entries.push(parsed);
    index += 1;
  }
  return entries.slice(-limit);
}

export async function recentActionLogContext({
  conversationId,
  limit = 10,
}: {
  conversationId: string;
  limit?: number;
}) {
  const entries = (await listActionLogEntries(500))
    .filter((entry) => entry.conversationId === conversationId)
    .slice(0, limit)
    .reverse();

  if (entries.length === 0) return "";

  return `
<recent_actions>
Recent actions you've taken in this conversation:
${entries
  .map(
    (entry) =>
      `- [${entry.timestamp}] ${entry.outcomeType}: ${entry.description} (target: ${entry.target})`,
  )
  .join("\n")}
Past actions provide context for "what's the state of the world right now." If the user asks what you did or what files you created, reference these actions.
</recent_actions>
`.trim();
}

function parseActionLine(line: string, index: number): ActionLogSummary | null {
  try {
    const parsed = JSON.parse(line) as ActionLogEntry;
    return { ...parsed, id: String(index) };
  } catch {
    return null;
  }
}

function redactActionEntry(entry: ActionLogEntry): ActionLogEntry {
  return {
    ...entry,
    description: redactSecrets(entry.description),
    metadata: redactUnknown(entry.metadata) as Record<string, unknown>,
    target: redactSecrets(entry.target),
    ...(entry.undoCommand ? { undoCommand: redactSecrets(entry.undoCommand) } : {}),
  };
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]),
    );
  }
  return value;
}
