import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redactSecrets } from "../lib/redact";

export type ScheduleAuditEvent =
  | "schedule_created"
  | "schedule_updated"
  | "schedule_deleted"
  | "schedule_enabled"
  | "schedule_disabled"
  | "schedule_run_started"
  | "schedule_run_completed"
  | "schedule_run_failed"
  | "schedule_run_skipped"
  | "schedule_backfill_started"
  | "schedule_backfill_completed"
  | "schedule_test_run_completed"
  | "schedule_approval_needed"
  | "schedule_integration_wait";

export interface ScheduleAuditEntry {
  event: ScheduleAuditEvent;
  scheduleId?: string;
  scheduleRunId?: string;
  userId: string;
  projectId?: string | null;
  targetType?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export function auditLogPath() {
  return join(process.env.HANDLE_LOG_DIR ?? join(homedir(), "Library", "Logs", "Handle"), "audit.log");
}

export async function appendScheduleAudit(entry: ScheduleAuditEntry) {
  const complete = redactSecrets(JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  }));
  const path = auditLogPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${complete}\n`, "utf8");
}
