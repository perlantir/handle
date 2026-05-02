import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS,
} from "./openaiChatgptAuth";
import {
  CHATGPT_OAUTH_PROXY_HEALTH_PATH,
  createChatGptOAuthProxyManager,
  createCodexResponsesRequest,
} from "./openaiChatgptProxy";

const profileValues: Record<string, string> = {
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken]: "test-access-token-not-real",
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accountId]: "account-123",
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.email]: "perlantir@example.com",
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires]: "1800000000000",
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.planType]: "plus",
  [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.refreshToken]: "test-refresh-token-not-real",
};

function keychain(overrides: Record<string, string> = {}) {
  const values = { ...profileValues, ...overrides };

  return {
    deleteCredential: vi.fn().mockResolvedValue(undefined),
    getCredential: vi.fn(async (account: string) => {
      const value = values[account];
      if (!value) throw new Error(`Missing ${account}`);
      return value;
    }),
    setCredential: vi.fn().mockResolvedValue(undefined),
  };
}

async function fetchOrNull(url: string) {
  return fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => null);
}

function successSse(text = "OK") {
  return new Response(
    [
      ...text.split("").map(
        (delta) =>
          `data: ${JSON.stringify({
            delta,
            type: "response.output_text.delta",
          })}`,
      ),
      `data: ${JSON.stringify({ type: "response.completed" })}`,
      "",
    ].join("\n\n"),
    { headers: { "Content-Type": "text/event-stream" }, status: 200 },
  );
}

describe("OpenAI ChatGPT OAuth proxy", () => {
  const managers: Array<ReturnType<typeof createChatGptOAuthProxyManager>> = [];

  afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.stop()));
    vi.restoreAllMocks();
  });

  it("converts Chat Completions requests into Codex Responses requests", async () => {
    const request = await createCodexResponsesRequest(
      {
        messages: [
          { content: "Use the tool carefully.", role: "system" },
          { content: "Read package.json", role: "user" },
        ],
        model: "gpt-5.1",
        tools: [
          {
            function: {
              description: "Read a file",
              name: "file_read",
              parameters: { properties: { path: { type: "string" } } },
            },
            type: "function",
          },
        ],
      },
      async () => "official Codex instructions",
    );

    expect(request).toMatchObject({
      include: ["reasoning.encrypted_content"],
      instructions: "official Codex instructions",
      model: "gpt-5.1",
      parallel_tool_calls: true,
      store: false,
      stream: true,
      tool_choice: "auto",
      tools: [
        {
          description: "Read a file",
          name: "file_read",
          parameters: { properties: { path: { type: "string" } } },
          type: "function",
        },
      ],
    });
    expect(request.input).toEqual([
      {
        content: [{ text: "Use the tool carefully.", type: "input_text" }],
        role: "developer",
        type: "message",
      },
      {
        content: [{ text: "Read package.json", type: "input_text" }],
        role: "user",
        type: "message",
      },
    ]);
  });

  it("starts on a dynamically selected port and stops cleanly", async () => {
    const manager = createChatGptOAuthProxyManager({
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain(),
      ports: [0],
    });
    managers.push(manager);

    const proxy = await manager.ensureStarted();

    expect(proxy.port).toBeGreaterThan(0);
    expect(proxy.baseURL).toBe(`http://127.0.0.1:${proxy.port}/v1`);

    const health = await fetch(
      `http://127.0.0.1:${proxy.port}${CHATGPT_OAUTH_PROXY_HEALTH_PATH}`,
    );
    await expect(health.json()).resolves.toEqual({
      service: "handle-chatgpt-oauth-proxy",
    });

    await manager.stop();
    managers.pop();

    const stopped = await fetchOrNull(
      `http://127.0.0.1:${proxy.port}${CHATGPT_OAUTH_PROXY_HEALTH_PATH}`,
    );
    expect(stopped).toBeNull();
  });

  it("reuses an existing Handle ChatGPT OAuth proxy on the chosen port", async () => {
    const first = createChatGptOAuthProxyManager({
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain(),
      ports: [0],
    });
    managers.push(first);
    const active = await first.ensureStarted();

    const second = createChatGptOAuthProxyManager({
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain(),
      ports: [active.port],
    });
    managers.push(second);

    const reused = await second.ensureStarted();

    expect(reused).toMatchObject({
      baseURL: active.baseURL,
      port: active.port,
      reused: true,
    });

    await second.stop();
    const stillRunning = await fetchOrNull(
      `http://127.0.0.1:${active.port}${CHATGPT_OAUTH_PROXY_HEALTH_PATH}`,
    );
    expect(stillRunning?.ok).toBe(true);
  });

  it("proxies Chat Completions SSE through the ChatGPT Codex backend", async () => {
    let upstreamRequestBody: Record<string, unknown> | null = null;
    let upstreamHeaders: Headers | null = null;
    const fetchUpstream = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        upstreamRequestBody = JSON.parse(String(init?.body));
        upstreamHeaders = new Headers(init?.headers);

        return successSse();
      },
    );
    const manager = createChatGptOAuthProxyManager({
      fetchUpstream,
      getInstructions: vi.fn(async () => "official Codex instructions"),
      keychain: keychain(),
      ports: [0],
    });
    managers.push(manager);
    const proxy = await manager.ensureStarted();

    const response = await fetch(`${proxy.baseURL}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: "Say OK", role: "user" }],
        model: "gpt-5.1",
        stream: true,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain('"content":"O"');
    expect(text).toContain('"content":"K"');
    expect(text).toContain("data: [DONE]");
    expect(fetchUpstream).toHaveBeenCalledWith(
      `${CHATGPT_BACKEND_BASE_URL}/codex/responses`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(upstreamHeaders).not.toBeNull();
    const headers = upstreamHeaders as unknown as Headers;
    expect(headers.get("authorization")).toBe(
      "Bearer test-access-token-not-real",
    );
    expect(headers.get("chatgpt-account-id")).toBe("account-123");
    expect(headers.get("originator")).toBe("codex_cli_rs");
    expect(upstreamRequestBody).toMatchObject({
      instructions: "official Codex instructions",
      model: "gpt-5.1",
      store: false,
      stream: true,
    });
  });

  it("refreshes proactively when the ChatGPT OAuth profile is near expiry", async () => {
    let upstreamHeaders: Headers | null = null;
    const fetchUpstream = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        upstreamHeaders = new Headers(init?.headers);
        return successSse();
      },
    );
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: "fresh-access-token-not-real",
      accountId: "account-123",
      expires: Date.now() + 60 * 60 * 1000,
      refreshToken: "fresh-refresh-token-not-real",
    });
    const manager = createChatGptOAuthProxyManager({
      fetchUpstream,
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain({
        [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.accessToken]:
          "stale-access-token-not-real",
        [CHATGPT_OAUTH_KEYCHAIN_ACCOUNTS.expires]: String(Date.now() + 60_000),
      }),
      ports: [0],
      refreshTokens,
    });
    managers.push(manager);
    const proxy = await manager.ensureStarted();

    await fetch(`${proxy.baseURL}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: "Say OK", role: "user" }],
        model: "gpt-5.1",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(refreshTokens).toHaveBeenCalledOnce();
    const headers = upstreamHeaders as unknown as Headers;
    expect(headers.get("authorization")).toBe(
      "Bearer fresh-access-token-not-real",
    );
  });

  it("refreshes once and retries when the ChatGPT Codex backend returns 401", async () => {
    const fetchUpstream = vi
      .fn()
      .mockResolvedValueOnce(new Response("expired token", { status: 401 }))
      .mockResolvedValueOnce(successSse());
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: "fresh-access-token-not-real",
      accountId: "account-123",
      expires: Date.now() + 60 * 60 * 1000,
      refreshToken: "fresh-refresh-token-not-real",
    });
    const manager = createChatGptOAuthProxyManager({
      fetchUpstream,
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain(),
      ports: [0],
      refreshTokens,
    });
    managers.push(manager);
    const proxy = await manager.ensureStarted();

    const response = await fetch(`${proxy.baseURL}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: "Say OK", role: "user" }],
        model: "gpt-5.1",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
    expect(refreshTokens).toHaveBeenCalledOnce();
  });

  it("returns a helpful OAuth-only fallback message when refresh fails", async () => {
    const fetchUpstream = vi
      .fn()
      .mockResolvedValueOnce(new Response("expired token", { status: 401 }));
    const manager = createChatGptOAuthProxyManager({
      fetchUpstream,
      getInstructions: vi.fn(async () => "instructions"),
      keychain: keychain(),
      ports: [0],
      refreshTokens: vi.fn().mockRejectedValue(new Error("refresh denied")),
    });
    managers.push(manager);
    const proxy = await manager.ensureStarted();

    const response = await fetch(`${proxy.baseURL}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: "Say OK", role: "user" }],
        model: "gpt-5.1",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    await expect(response.json()).resolves.toEqual({
      error:
        "OpenAI ChatGPT Subscription auth failed: refresh denied. To enable fallback, also configure your OpenAI API key, Anthropic, OpenRouter, or another provider.",
      originalError: "expired token",
    });
    expect(response.status).toBe(502);
  });
});
