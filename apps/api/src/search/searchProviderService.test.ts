import { describe, expect, it, vi } from "vitest";
import {
  queryProvider,
  webFetch,
  webSearch,
  type SearchKeychainLike,
  type SearchProviderConfigRow,
  type SearchProviderStore,
} from "./searchProviderService";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });
}

function store(rows: SearchProviderConfigRow[]): SearchProviderStore {
  const byProvider = new Map(rows.map((row) => [row.providerId, row]));
  return {
    projectSearchSettings: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args: { create: unknown }) => args.create as never),
    },
    searchProviderConfig: {
      findMany: vi.fn(async () => Array.from(byProvider.values())),
      findUnique: vi.fn(async (args: { where: { userId_providerId: { providerId: string } } }) =>
        byProvider.get(args.where.userId_providerId.providerId) ?? null,
      ),
      update: vi.fn(async (args: { data: Partial<SearchProviderConfigRow>; where: { userId_providerId: { providerId: string } } }) => {
        const current = byProvider.get(args.where.userId_providerId.providerId);
        if (!current) throw new Error("missing row");
        const updated = { ...current, ...args.data };
        byProvider.set(args.where.userId_providerId.providerId, updated);
        return updated;
      }),
      upsert: vi.fn(async (args: { create: SearchProviderConfigRow; where: { userId_providerId: { providerId: string } } }) => {
        const current = byProvider.get(args.where.userId_providerId.providerId);
        if (current) return current;
        byProvider.set(args.create.providerId, args.create);
        return args.create;
      }),
    },
  };
}

function keychain(credentials: Record<string, string>): SearchKeychainLike {
  return {
    async deleteCredential(account) {
      delete credentials[account];
    },
    async getCredential(account) {
      const value = credentials[account];
      if (!value) throw new Error(`Credential not found: ${account}`);
      return value;
    },
    async setCredential(account, value) {
      credentials[account] = value;
    },
  };
}

describe("queryProvider", () => {
  it("calls Tavily with bearer auth and normalizes results", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        results: [{ content: "Snippet", score: 0.8, title: "Result", url: "https://example.com" }],
      }),
    ) as unknown as typeof fetch;

    const result = await queryProvider({
      apiKey: "test-key-not-real",
      fetchImpl,
      maxResults: 3,
      providerId: "TAVILY",
      query: "handle",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key-not-real" }),
        method: "POST",
      }),
    );
    expect(result.results[0]).toMatchObject({
      snippet: "Snippet",
      sourceProvider: "TAVILY",
      title: "Result",
      url: "https://example.com",
    });
  });

  it("calls Serper with X-API-KEY", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        organic: [{ link: "https://example.com/a", snippet: "A", title: "A" }],
      }),
    ) as unknown as typeof fetch;

    const result = await queryProvider({
      apiKey: "test-key-not-real",
      fetchImpl,
      maxResults: 1,
      providerId: "SERPER",
      query: "handle",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://google.serper.dev/search",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-KEY": "test-key-not-real" }),
      }),
    );
    expect(result.results[0]?.sourceProvider).toBe("SERPER");
  });

  it("calls Brave with X-Subscription-Token", async () => {
    const fetchMock = vi.fn<[URL, RequestInit?], Promise<Response>>(async () =>
      response({
        web: { results: [{ description: "B", title: "B", url: "https://example.com/b" }] },
      }),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const result = await queryProvider({
      apiKey: "test-key-not-real",
      fetchImpl,
      maxResults: 1,
      providerId: "BRAVE",
      query: "handle",
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const request = firstCall?.[0] as URL;
    expect(request.toString()).toContain("api.search.brave.com");
    expect(firstCall?.[1]).toMatchObject({
      headers: expect.objectContaining({ "X-Subscription-Token": "test-key-not-real" }),
    });
    expect(result.results[0]?.sourceProvider).toBe("BRAVE");
  });
});

describe("webSearch", () => {
  it("falls back to the next enabled provider when the first configured provider rate limits", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ error: "rate limited" }, { status: 429 }))
      .mockResolvedValueOnce(response({ organic: [{ link: "https://example.com", snippet: "OK", title: "OK" }] })) as unknown as typeof fetch;

    const result = await webSearch({
      fetchImpl,
      keychain: keychain({
        "alias-serper": "test-key-not-real",
        "alias-tavily": "test-key-not-real",
      }),
      store: store([
        {
          enabled: true,
          keychainAlias: "alias-tavily",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastTestedAt: null,
          memoryScope: "NONE",
          providerId: "TAVILY",
          rateLimitPerMinute: null,
        },
        {
          enabled: true,
          keychainAlias: "alias-serper",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastTestedAt: null,
          memoryScope: "NONE",
          providerId: "SERPER",
          rateLimitPerMinute: null,
        },
      ]),
      query: "handle",
      userId: "user-test",
    });

    expect(result.providerId).toBe("SERPER");
    expect(result.results).toHaveLength(1);
  });
});

describe("webFetch", () => {
  it("fetches and truncates HTTP content", async () => {
    const fetchImpl = vi.fn(async () => new Response("abcdef", { status: 200 })) as unknown as typeof fetch;
    const result = await webFetch({
      fetchImpl,
      maxBytes: 3,
      url: "https://example.com",
    });

    expect(result.content).toBe("abc");
    expect(result.truncated).toBe(true);
  });

  it("rejects non-http URLs", async () => {
    await expect(webFetch({ url: "file:///etc/passwd" })).rejects.toThrow(/http and https/);
  });
});
