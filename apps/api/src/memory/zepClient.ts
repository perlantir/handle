import { redactSecrets } from "../lib/redact";
import { appendMemoryLog, type MemoryProvider } from "./memoryLog";

export type MemoryConnectionStatus = "online" | "offline";

export interface ZepClientConfig {
  provider: MemoryProvider;
  baseUrl: string;
  apiKey?: string;
}

export interface ZepUserInput {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
}

export interface ZepOperationResult<T = unknown> {
  ok: boolean;
  value?: T;
  status: MemoryConnectionStatus;
  detail?: string;
}

export interface ZepMemoryMessage {
  role: "assistant" | "system" | "user";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ZepMemorySearchResult {
  content: string;
  metadata?: Record<string, unknown>;
  role?: string;
  score?: number;
}

export interface MemoryStatusSnapshot {
  provider: MemoryProvider;
  status: MemoryConnectionStatus;
  detail?: string;
  checkedAt: string;
}

type FetchLike = typeof fetch;

export class HandleZepClient {
  private readonly config: ZepClientConfig;
  private readonly fetchImpl: FetchLike;
  private lastStatus: MemoryStatusSnapshot | null = null;

  constructor(config: Partial<ZepClientConfig> = {}, fetchImpl: FetchLike = fetch) {
    const apiKey = config.apiKey ?? process.env.ZEP_API_KEY;
    this.config = {
      provider: config.provider ?? defaultMemoryProvider(),
      baseUrl: stripTrailingSlash(config.baseUrl ?? defaultZepBaseUrl()),
      ...(apiKey ? { apiKey } : {}),
    };
    this.fetchImpl = fetchImpl;
  }

  getConfig() {
    return { ...this.config };
  }

  getLastStatus() {
    return this.lastStatus;
  }

  async checkConnection(): Promise<MemoryStatusSnapshot> {
    const startedAt = Date.now();
    const operation = "check_connection";
    try {
      const response = await this.request("/", { method: "GET" });
      const status: MemoryConnectionStatus = response.ok || response.status === 404 ? "online" : "offline";
      const detail = response.ok
        ? "Zep API reachable"
        : response.status === 404
          ? "Zep API reachable"
          : `Zep returned HTTP ${response.status}`;
      this.lastStatus = {
        provider: this.config.provider,
        status,
        detail,
        checkedAt: new Date().toISOString(),
      };
      await appendMemoryLog({
        operation,
        provider: this.config.provider,
        status: status === "online" ? "ok" : "offline",
        durationMs: Date.now() - startedAt,
      });
      return this.lastStatus;
    } catch (error) {
      const detail = errorMessage(error);
      this.lastStatus = {
        provider: this.config.provider,
        status: "offline",
        detail,
        checkedAt: new Date().toISOString(),
      };
      await appendMemoryLog({
        operation,
        provider: this.config.provider,
        status: "offline",
        errorType: errorName(error),
        durationMs: Date.now() - startedAt,
      });
      return this.lastStatus;
    }
  }

  async ensureUser(input: ZepUserInput): Promise<ZepOperationResult> {
    return this.safeOperation("ensure_user", async () => {
      const existing = await this.request(`/api/v1/user/${encodeURIComponent(input.userId)}`, {
        method: "GET",
      });
      if (existing.ok) {
        return existing.json().catch(() => ({}));
      }

      const created = await this.request("/api/v1/user", {
        method: "POST",
        body: JSON.stringify({
          user_id: input.userId,
          email: input.email ?? `${encodeURIComponent(input.userId)}@handle.local`,
          first_name: input.firstName ?? "Handle",
          last_name: input.lastName ?? "User",
          metadata: input.metadata ?? {},
        }),
      });

      if (created.ok) {
        return created.json().catch(() => ({}));
      }

      const body = await created.text();
      if (created.status === 400 && body.toLowerCase().includes("already exists")) {
        return { user_id: input.userId };
      }

      throw new Error(`Zep user create failed: HTTP ${created.status} ${body.slice(0, 240)}`);
    });
  }

  async ensureSession(input: {
    metadata?: Record<string, unknown>;
    sessionId: string;
    userId?: string;
  }): Promise<ZepOperationResult> {
    return this.safeOperation("ensure_session", async () => {
      const existing = await this.request(
        `/api/v1/sessions/${encodeURIComponent(input.sessionId)}/`,
        { method: "GET" },
      );
      if (existing.ok) {
        return existing.json().catch(() => ({}));
      }

      const created = await this.request("/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify({
          session_id: input.sessionId,
          ...(input.userId ? { user_id: input.userId } : {}),
          metadata: input.metadata ?? {},
        }),
      });

      if (created.ok) {
        return created.json().catch(() => ({}));
      }

      const body = await created.text();
      if (created.status === 500 && body.toLowerCase().includes("duplicate")) {
        return { session_id: input.sessionId };
      }

      throw new Error(`Zep session create failed: HTTP ${created.status} ${body.slice(0, 240)}`);
    });
  }

  async addMemoryMessages(input: {
    messages: ZepMemoryMessage[];
    sessionId: string;
  }): Promise<ZepOperationResult> {
    return this.safeOperation("add_memory_messages", async () => {
      const response = await this.request(
        `/api/v1/sessions/${encodeURIComponent(input.sessionId)}/memory`,
        {
          method: "POST",
          body: JSON.stringify({ messages: input.messages }),
        },
      );
      if (response.ok) return response.text();
      const body = await response.text();
      throw new Error(`Zep memory write failed: HTTP ${response.status} ${body.slice(0, 240)}`);
    });
  }

  async searchMemory(input: {
    limit?: number;
    query: string;
    sessionId: string;
  }): Promise<ZepOperationResult<ZepMemorySearchResult[]>> {
    return this.safeOperation("search_memory", async () => {
      const limit = input.limit ?? 8;
      const response = await this.request(
        `/api/v1/sessions/${encodeURIComponent(input.sessionId)}/search?limit=${limit}`,
        {
          method: "POST",
          body: JSON.stringify({
            search_scope: "messages",
            search_type: "similarity",
            text: input.query,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Zep memory search failed: HTTP ${response.status} ${body.slice(0, 240)}`);
      }

      const raw = (await response.json().catch(() => [])) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((item) => normalizeSearchResult(item));
    });
  }

  private async safeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<ZepOperationResult<T>> {
    const startedAt = Date.now();
    try {
      const value = await fn();
      this.lastStatus = {
        provider: this.config.provider,
        status: "online",
        detail: "Zep API reachable",
        checkedAt: new Date().toISOString(),
      };
      await appendMemoryLog({
        operation,
        provider: this.config.provider,
        status: "ok",
        durationMs: Date.now() - startedAt,
      });
      return { ok: true, value, status: "online" };
    } catch (error) {
      const detail = errorMessage(error);
      this.lastStatus = {
        provider: this.config.provider,
        status: "offline",
        detail,
        checkedAt: new Date().toISOString(),
      };
      await appendMemoryLog({
        operation,
        provider: this.config.provider,
        status: "offline",
        errorType: errorName(error),
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, status: "offline", detail };
    }
  }

  private request(path: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.config.apiKey) {
      headers.set("Authorization", `Bearer ${this.config.apiKey}`);
    }
    return this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
    });
  }
}

let singleton: HandleZepClient | null = null;

export function getZepClient() {
  singleton ??= new HandleZepClient();
  return singleton;
}

export function resetZepClientForTests() {
  singleton = null;
}

function defaultMemoryProvider(): MemoryProvider {
  return process.env.ZEP_PROVIDER === "cloud" || process.env.HANDLE_MEMORY_PROVIDER === "cloud"
    ? "cloud"
    : "self-hosted";
}

function defaultZepBaseUrl() {
  if (process.env.ZEP_BASE_URL) return process.env.ZEP_BASE_URL;
  if (defaultMemoryProvider() === "cloud") return "https://api.getzep.com";
  return "http://127.0.0.1:8000";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "Error";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message);
}

function normalizeSearchResult(item: unknown): ZepMemorySearchResult[] {
  if (!item || typeof item !== "object") return [];
  const record = item as {
    dist?: unknown;
    message?: {
      content?: unknown;
      metadata?: unknown;
      role?: unknown;
    };
  };
  const content = record.message?.content;
  if (typeof content !== "string" || !content.trim()) return [];

  const result: ZepMemorySearchResult = { content };
  if (typeof record.message?.role === "string") {
    result.role = record.message.role;
  }
  if (record.message?.metadata && typeof record.message.metadata === "object") {
    result.metadata = record.message.metadata as Record<string, unknown>;
  }
  if (typeof record.dist === "number") {
    result.score = record.dist;
  }
  return [result];
}
