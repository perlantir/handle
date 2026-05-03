import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HandleZepClient } from "./zepClient";

let logDir: string;

beforeEach(async () => {
  logDir = await mkdtemp(join(tmpdir(), "handle-memory-log-"));
  process.env.HANDLE_LOG_DIR = logDir;
});

afterEach(async () => {
  delete process.env.HANDLE_LOG_DIR;
  await rm(logDir, { force: true, recursive: true });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}

describe("HandleZepClient", () => {
  it("checks connection and writes a memory log entry", async () => {
    const fetchImpl = vi.fn(async () => new Response("."));
    const client = new HandleZepClient({ baseUrl: "http://zep.test" }, fetchImpl as typeof fetch);

    const status = await client.checkConnection();

    expect(status.status).toBe("online");
    expect(fetchImpl).toHaveBeenCalledWith("http://zep.test/", expect.any(Object));
    const log = await readFile(join(logDir, "memory.log"), "utf8");
    expect(log).toContain('"operation":"check_connection"');
    expect(log).toContain('"status":"ok"');
  });

  it("ensures a user by reading before creating", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/user/user-1") && init?.method === "GET") {
        return new Response("not found", { status: 404 });
      }
      if (String(url).endsWith("/api/v1/user") && init?.method === "POST") {
        return jsonResponse({ user_id: "user-1" }, { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    });
    const client = new HandleZepClient({ baseUrl: "http://zep.test" }, fetchImpl as typeof fetch);

    const result = await client.ensureUser({ userId: "user-1" });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toContain('"user_id":"user-1"');
  });

  it("gracefully degrades when Zep is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    });
    const client = new HandleZepClient({ baseUrl: "http://zep.test" }, fetchImpl as typeof fetch);

    const result = await client.ensureUser({ userId: "user-1" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("offline");
    expect(result.detail).toContain("ECONNREFUSED");
    const log = await readFile(join(logDir, "memory.log"), "utf8");
    expect(log).toContain('"operation":"ensure_user"');
    expect(log).toContain('"status":"offline"');
  });
});
