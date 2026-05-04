import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditLogPath } from "./auditLog";
import { actionLogPath } from "./actionLog";
import { handleLogDir } from "./logPaths";

const originalLogDir = process.env.HANDLE_LOG_DIR;

describe("log path helpers", () => {
  afterEach(() => {
    if (originalLogDir === undefined) {
      delete process.env.HANDLE_LOG_DIR;
    } else {
      process.env.HANDLE_LOG_DIR = originalLogDir;
    }
  });

  it("expands HANDLE_LOG_DIR when it starts with a home-directory token", () => {
    process.env.HANDLE_LOG_DIR = "~/Library/Logs/Handle";

    expect(handleLogDir()).toBe(join(homedir(), "Library", "Logs", "Handle"));
    expect(auditLogPath()).toBe(join(homedir(), "Library", "Logs", "Handle", "audit.log"));
    expect(actionLogPath()).toBe(join(homedir(), "Library", "Logs", "Handle", "actions.log"));
  });
});
