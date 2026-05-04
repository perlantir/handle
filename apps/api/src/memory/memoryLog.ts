import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "../lib/redact";

export type MemoryProvider = "self-hosted" | "cloud";
export type MemoryOperationStatus = "ok" | "offline" | "error";
export type MemoryScopeForLog = "GLOBAL_AND_PROJECT" | "PROJECT_ONLY" | "NONE";

export interface MemoryLogEntry {
  timestamp?: string;
  operation: string;
  provider: MemoryProvider;
  scope?: MemoryScopeForLog;
  projectId?: string;
  conversationId?: string;
  status: MemoryOperationStatus;
  details?: Record<string, unknown>;
  errorType?: string;
  durationMs: number;
}

function expandHome(path: string) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function getMemoryLogDir() {
  return expandHome(process.env.HANDLE_LOG_DIR ?? "~/Library/Logs/Handle");
}

export function getMemoryLogPath() {
  return join(getMemoryLogDir(), "memory.log");
}

export async function appendMemoryLog(entry: MemoryLogEntry) {
  const memoryLogDir = getMemoryLogDir();
  const memoryLogPath = join(memoryLogDir, "memory.log");
  await mkdir(memoryLogDir, { recursive: true });
  const payload = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  await appendFile(memoryLogPath, `${redactSecrets(JSON.stringify(payload))}\n`, "utf8");
}
