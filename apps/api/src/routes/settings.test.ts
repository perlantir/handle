import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createKeychainClient } from "../lib/keychain";
import type { ChatGptOAuthService } from "../providers/openaiChatgptOAuthFlow";
import type { ChatGptOAuthProxyManager } from "../providers/openaiChatgptProxy";
import type {
  ProviderConfig,
  ProviderId,
  ProviderInstance,
} from "../providers/types";
import {
  createSettingsRouter,
  type CreateSettingsRouterOptions,
  type KeychainLike,
  type ProviderConfigRow,
  type SettingsRouteStore,
} from "./settings";

function row(overrides: Partial<ProviderConfigRow>): ProviderConfigRow {
  return {
    authMode: "apiKey",
    baseURL: null,
    enabled: false,
    fallbackOrder: 1,
    id: "openai",
    modelName: null,
    primaryModel: "test-model",
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
    ...overrides,
  };
}

function store(rows: ProviderConfigRow[]): SettingsRouteStore {
  const records = new Map(rows.map((item) => [item.id, { ...item }]));

  return {
    providerConfig: {
      findMany: vi.fn().mockResolvedValue(Array.from(records.values())),
      findUnique: vi.fn(async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        return records.get(where.id) ?? null;
      }),
      update: vi.fn(async (args: unknown) => {
        const { data, where } = args as {
          data: Partial<ProviderConfigRow>;
          where: { id: string };
        };
        const existing = records.get(where.id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        records.set(where.id, updated);
        return updated;
      }),
    },
  };
}

function provider(
  config: ProviderConfig,
  model: BaseChatModel,
): ProviderInstance {
  return {
    config,
    createModel: vi.fn().mockResolvedValue(model),
    description: config.id,
    id: config.id,
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

interface CreateAppOptions {
  chatgptOAuthProxy?: Pick<ChatGptOAuthProxyManager, "stop">;
  chatgptOAuthService?: ChatGptOAuthService;
  createProvider?: (config: ProviderConfig) => ProviderInstance;
  getUserId?: () => string | null;
  keychain?: KeychainLike;
  store?: SettingsRouteStore;
}

function createApp({
  chatgptOAuthProxy,
  chatgptOAuthService,
  createProvider,
  getUserId = () => "user-test",
  keychain,
  store: routeStore = store([row({ id: "openai" })]),
}: CreateAppOptions = {}) {
  const app = express();
  const routerOptions: CreateSettingsRouterOptions = {
    ...(chatgptOAuthProxy ? { chatgptOAuthProxy } : {}),
    ...(chatgptOAuthService ? { chatgptOAuthService } : {}),
    getUserId,
    store: routeStore,
  };
  if (createProvider) routerOptions.createProvider = createProvider;
  if (keychain) routerOptions.keychain = keychain;

  app.use(express.json());
  app.use("/api/settings", createSettingsRouter(routerOptions));
  return app;
}

const validApiKeys: Record<ProviderId, string> = {
  anthropic: `sk-ant-${"a".repeat(30)}`,
  kimi: `sk-${"k".repeat(30)}`,
  local: "placeholder",
  openai: `sk-${"o".repeat(30)}`,
  openrouter: `sk-or-${"r".repeat(30)}`,
};

const expectedKeyFormats: Record<ProviderId, string> = {
  anthropic: "sk-ant- followed by 20+ letters, numbers, underscores, or dashes",
  kimi: "sk- followed by 20+ letters, numbers, underscores, or dashes",
  local: "any non-empty string",
  openai:
    "sk- or sk-proj- followed by 20+ letters, numbers, underscores, or dashes",
  openrouter: "sk-or- followed by 20+ letters, numbers, underscores, or dashes",
};

function mockKeychain(readBack = "unused-key") {
  return {
    deleteCredential: vi.fn().mockResolvedValue(undefined),
    getCredential: vi.fn().mockResolvedValue(readBack),
    setCredential: vi.fn().mockResolvedValue(undefined),
  };
}

function mockChatGptOAuthService(
  overrides: Partial<ChatGptOAuthService> = {},
): ChatGptOAuthService {
  return {
    disconnect: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({
      accountId: "account-123",
      email: "perlantir@example.com",
      expires: 1_800_000_000_000,
      planType: "plus",
      signedIn: true,
    }),
    start: vi.fn().mockResolvedValue({
      authUrl: "https://auth.openai.com/oauth/authorize?state=test-state",
      expiresInMs: 600_000,
      port: 1455,
      redirectUri: "http://localhost:1455/auth/callback",
      state: "test-state",
    }),
    status: vi.fn().mockResolvedValue({
      accountId: "account-123",
      email: "perlantir@example.com",
      expires: 1_800_000_000_000,
      flowError: null,
      flowState: null,
      planType: "plus",
      port: null,
      signedIn: true,
    }),
    ...overrides,
  };
}

describe("settings providers route", () => {
  it("lists provider configs without secrets", async () => {
    const routeStore = store([
      row({ enabled: true, id: "openai", primaryModel: "gpt-5.2" }),
      row({
        baseURL: "http://127.0.0.1:11434/v1",
        fallbackOrder: 2,
        id: "local",
        modelName: "Local Llama",
        primaryModel: "llama3.2",
      }),
    ]);
    const keychain = {
      deleteCredential: vi.fn(),
      getCredential: vi.fn(async (account: string) => {
        if (account === "openai:apiKey") return "test-key-not-real";
        throw new Error("not found");
      }),
      setCredential: vi.fn(),
    };

    const response = await request(createApp({ keychain, store: routeStore }))
      .get("/api/settings/providers")
      .expect(200);

    expect(response.body.providers).toEqual([
      expect.objectContaining({
        authMode: "apiKey",
        description: "OpenAI",
        enabled: true,
        hasApiKey: true,
        id: "openai",
        primaryModel: "gpt-5.2",
      }),
      expect.objectContaining({
        baseURL: "http://127.0.0.1:11434/v1",
        description: "Local LLM",
        hasApiKey: false,
        id: "local",
        modelName: "Local Llama",
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain("test-key-not-real");
  });

  it("updates local provider settings", async () => {
    const routeStore = store([row({ id: "local" })]);

    const response = await request(createApp({ store: routeStore }))
      .put("/api/settings/providers/local")
      .send({
        baseURL: "http://127.0.0.1:11434/v1",
        enabled: true,
        fallbackOrder: 5,
        modelName: "Local Llama",
        primaryModel: "llama3.2",
      })
      .expect(200);

    expect(response.body.provider).toMatchObject({
      baseURL: "http://127.0.0.1:11434/v1",
      enabled: true,
      id: "local",
      modelName: "Local Llama",
      primaryModel: "llama3.2",
    });
    expect(routeStore.providerConfig.update).toHaveBeenCalledWith({
      data: {
        baseURL: "http://127.0.0.1:11434/v1",
        enabled: true,
        fallbackOrder: 5,
        modelName: "Local Llama",
        primaryModel: "llama3.2",
      },
      where: { id: "local" },
    });
  });

  it("updates KIMI base URL for regional overrides", async () => {
    const routeStore = store([row({ id: "kimi" })]);

    const response = await request(createApp({ store: routeStore }))
      .put("/api/settings/providers/kimi")
      .send({ baseURL: "https://api.moonshot.cn/v1" })
      .expect(200);

    expect(response.body.provider).toMatchObject({
      baseURL: "https://api.moonshot.cn/v1",
      id: "kimi",
    });
    expect(routeStore.providerConfig.update).toHaveBeenCalledWith({
      data: { baseURL: "https://api.moonshot.cn/v1" },
      where: { id: "kimi" },
    });
  });

  it("updates OpenAI auth mode and stops the ChatGPT OAuth proxy when switching back to API key", async () => {
    const routeStore = store([
      row({ authMode: "chatgpt-oauth", enabled: true, id: "openai" }),
    ]);
    const chatgptOAuthProxy = { stop: vi.fn().mockResolvedValue(undefined) };

    const response = await request(
      createApp({ chatgptOAuthProxy, store: routeStore }),
    )
      .put("/api/settings/providers/openai")
      .send({ authMode: "apiKey" })
      .expect(200);

    expect(response.body.provider).toMatchObject({
      authMode: "apiKey",
      id: "openai",
    });
    expect(routeStore.providerConfig.update).toHaveBeenCalledWith({
      data: { authMode: "apiKey" },
      where: { id: "openai" },
    });
    expect(chatgptOAuthProxy.stop).toHaveBeenCalledOnce();
  });

  it("rejects auth mode updates for non-OpenAI providers", async () => {
    const routeStore = store([row({ id: "anthropic" })]);

    await request(createApp({ store: routeStore }))
      .put("/api/settings/providers/anthropic")
      .send({ authMode: "chatgpt-oauth" })
      .expect(400);

    expect(routeStore.providerConfig.update).not.toHaveBeenCalled();
  });

  it("rejects non-local base URL updates", async () => {
    const routeStore = store([row({ id: "openrouter" })]);

    await request(createApp({ store: routeStore }))
      .put("/api/settings/providers/openrouter")
      .send({ baseURL: "https://openrouter.ai/api/v1" })
      .expect(400);

    expect(routeStore.providerConfig.update).not.toHaveBeenCalled();
  });

  it("rejects non-local model name updates", async () => {
    const routeStore = store([row({ id: "kimi" })]);

    await request(createApp({ store: routeStore }))
      .put("/api/settings/providers/kimi")
      .send({ modelName: "China endpoint" })
      .expect(400);

    expect(routeStore.providerConfig.update).not.toHaveBeenCalled();
  });

  it("writes provider keys to Keychain and verifies by reading back", async () => {
    const apiKey = validApiKeys.openrouter;
    const values = new Map<string, string>();
    const runSecurity = vi.fn(async (_command: string, args: string[]) => {
      const account = args.at(args.indexOf("-a") + 1) ?? "";
      if (args[0] === "add-generic-password") {
        const value = args.at(args.indexOf("-w") + 1) ?? "";
        values.set(account, value);
        return {};
      }
      if (args[0] === "find-generic-password") {
        return { stdout: `${values.get(account) ?? ""}\n` };
      }
      throw new Error(`Unexpected security command: ${args[0]}`);
    });
    const keychain = createKeychainClient({ runSecurity });

    const response = await request(createApp({ keychain }))
      .post("/api/settings/providers/openrouter/key")
      .send({ apiKey })
      .expect(200);

    expect(response.body).toEqual({ providerId: "openrouter", saved: true });
    expect(runSecurity).toHaveBeenCalledWith(
      "security",
      expect.arrayContaining(["add-generic-password"]),
    );
    expect(runSecurity).toHaveBeenCalledWith(
      "security",
      expect.arrayContaining(["find-generic-password"]),
    );
  });

  it.each(["openai", "anthropic", "kimi", "openrouter"] as const)(
    "rejects invalid API key formats for %s before writing to Keychain",
    async (providerId) => {
      const keychain = mockKeychain();

      for (const apiKey of ["placeholder", "test", "", "sk-short"]) {
        const response = await request(createApp({ keychain }))
          .post(`/api/settings/providers/${providerId}/key`)
          .send({ apiKey })
          .expect(400);

        expect(response.body).toEqual({
          error: `Invalid API key format for ${providerId}`,
          expected: expectedKeyFormats[providerId],
        });
      }

      expect(keychain.setCredential).not.toHaveBeenCalled();
      expect(keychain.getCredential).not.toHaveBeenCalled();
    },
  );

  it("rejects empty local keys but accepts non-empty local keys", async () => {
    const invalidKeychain = mockKeychain();

    const invalidResponse = await request(
      createApp({ keychain: invalidKeychain }),
    )
      .post("/api/settings/providers/local/key")
      .send({ apiKey: "" })
      .expect(400);

    expect(invalidResponse.body).toEqual({
      error: "Invalid API key format for local",
      expected: expectedKeyFormats.local,
    });
    expect(invalidKeychain.setCredential).not.toHaveBeenCalled();

    const keychain = mockKeychain(validApiKeys.local);

    await request(createApp({ keychain }))
      .post("/api/settings/providers/local/key")
      .send({ apiKey: validApiKeys.local })
      .expect(200);

    expect(keychain.setCredential).toHaveBeenCalledWith(
      "local:apiKey",
      validApiKeys.local,
    );
  });

  it.each(Object.entries(validApiKeys) as Array<[ProviderId, string]>)(
    "accepts valid-shaped fake keys for %s",
    async (providerId, apiKey) => {
      const keychain = mockKeychain(apiKey);

      await request(createApp({ keychain }))
        .post(`/api/settings/providers/${providerId}/key`)
        .send({ apiKey })
        .expect(200);

      expect(keychain.setCredential).toHaveBeenCalledWith(
        `${providerId}:apiKey`,
        apiKey,
      );
      expect(keychain.getCredential).toHaveBeenCalledWith(
        `${providerId}:apiKey`,
      );
    },
  );

  it("rejects KIMI YSK-prefixed keys", async () => {
    const keychain = mockKeychain();

    const response = await request(createApp({ keychain }))
      .post("/api/settings/providers/kimi/key")
      .send({ apiKey: `YSK${"y".repeat(30)}` })
      .expect(400);

    expect(response.body).toEqual({
      error: "Invalid API key format for kimi",
      expected: expectedKeyFormats.kimi,
    });
    expect(keychain.setCredential).not.toHaveBeenCalled();
  });

  it("deletes provider keys from Keychain", async () => {
    const runSecurity = vi.fn().mockResolvedValue({});
    const keychain = createKeychainClient({ runSecurity });

    const response = await request(createApp({ keychain }))
      .delete("/api/settings/providers/kimi/key")
      .expect(200);

    expect(response.body).toEqual({ deleted: true, providerId: "kimi" });
    expect(runSecurity).toHaveBeenCalledWith("security", [
      "delete-generic-password",
      "-s",
      "com.perlantir.handle",
      "-a",
      "kimi:apiKey",
    ]);
  });

  it("starts the OpenAI ChatGPT OAuth flow", async () => {
    const chatgptOAuthService = mockChatGptOAuthService();

    const response = await request(createApp({ chatgptOAuthService }))
      .post("/api/settings/providers/openai/oauth/start")
      .expect(200);

    expect(response.body).toEqual({
      authUrl: "https://auth.openai.com/oauth/authorize?state=test-state",
      expiresInMs: 600_000,
      port: 1455,
      providerId: "openai",
      redirectUri: "http://localhost:1455/auth/callback",
      state: "test-state",
    });
    expect(chatgptOAuthService.start).toHaveBeenCalledWith("user-test");
  });

  it("returns the OpenAI ChatGPT OAuth status", async () => {
    const chatgptOAuthService = mockChatGptOAuthService();

    const response = await request(createApp({ chatgptOAuthService }))
      .get("/api/settings/providers/openai/oauth/status")
      .expect(200);

    expect(response.body).toEqual({
      providerId: "openai",
      status: {
        accountId: "account-123",
        email: "perlantir@example.com",
        expires: 1_800_000_000_000,
        flowError: null,
        flowState: null,
        planType: "plus",
        port: null,
        signedIn: true,
      },
    });
    expect(chatgptOAuthService.status).toHaveBeenCalledWith("user-test");
  });

  it("refreshes OpenAI ChatGPT OAuth tokens", async () => {
    const chatgptOAuthService = mockChatGptOAuthService();

    const response = await request(createApp({ chatgptOAuthService }))
      .post("/api/settings/providers/openai/oauth/refresh")
      .expect(200);

    expect(response.body).toEqual({
      providerId: "openai",
      status: {
        accountId: "account-123",
        email: "perlantir@example.com",
        expires: 1_800_000_000_000,
        planType: "plus",
        signedIn: true,
      },
    });
    expect(chatgptOAuthService.refresh).toHaveBeenCalled();
  });

  it("disconnects OpenAI ChatGPT OAuth tokens", async () => {
    const chatgptOAuthService = mockChatGptOAuthService();
    const chatgptOAuthProxy = { stop: vi.fn().mockResolvedValue(undefined) };

    const response = await request(
      createApp({ chatgptOAuthProxy, chatgptOAuthService }),
    )
      .delete("/api/settings/providers/openai/oauth/disconnect")
      .expect(200);

    expect(response.body).toEqual({
      disconnected: true,
      providerId: "openai",
    });
    expect(chatgptOAuthService.disconnect).toHaveBeenCalled();
    expect(chatgptOAuthProxy.stop).toHaveBeenCalledOnce();
  });

  it("returns verbatim OpenAI ChatGPT OAuth start failures", async () => {
    const chatgptOAuthService = mockChatGptOAuthService({
      start: vi
        .fn()
        .mockRejectedValue(new Error("Port 1455 is already in use")),
    });

    const response = await request(createApp({ chatgptOAuthService }))
      .post("/api/settings/providers/openai/oauth/start")
      .expect(502);

    expect(response.body).toEqual({
      error: "Port 1455 is already in use",
      providerId: "openai",
    });
  });

  it("tests provider models with the OK prompt", async () => {
    const invoke = vi.fn().mockResolvedValue({ content: "OK" });
    const model = { invoke } as unknown as BaseChatModel;
    const createProvider = vi.fn((config: ProviderConfig) =>
      provider(config, model),
    );

    const response = await request(createApp({ createProvider }))
      .post("/api/settings/providers/openai/test")
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      providerId: "openai",
      response: "OK",
    });
    expect(invoke).toHaveBeenCalledWith("Hello, respond with OK.");
  });

  it("returns verbatim provider test failures", async () => {
    const createProvider = vi.fn((config: ProviderConfig) => ({
      ...provider(config, { invoke: vi.fn() } as unknown as BaseChatModel),
      createModel: vi
        .fn()
        .mockRejectedValue(new Error("Rate limit: retry after 10s")),
    }));

    const response = await request(createApp({ createProvider }))
      .post("/api/settings/providers/openai/test")
      .expect(502);

    expect(response.body).toEqual({
      error: "Rate limit: retry after 10s",
      ok: false,
      providerId: "openai",
    });
  });

  it("requires authentication", async () => {
    await request(createApp({ getUserId: () => null }))
      .get("/api/settings/providers")
      .expect(401);
  });
});
