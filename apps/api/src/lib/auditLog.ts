import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { handleLogDir } from "./logPaths";
import { redactSecrets } from "./redact";

export interface StructuredAuditEvent {
  event: string;
  timestamp?: string;
  [key: string]: unknown;
}

export function auditLogPath() {
  return join(handleLogDir(), "audit.log");
}

export async function appendAuditEvent(event: StructuredAuditEvent) {
  const path = auditLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify(redactUnknown({ timestamp: new Date().toISOString(), ...event }))}\n`,
    "utf8",
  );
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactUnknown(item),
      ]),
    );
  }
  return value;
}
