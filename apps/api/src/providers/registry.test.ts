import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import { ProviderRegistryImpl } from "./registry";
import type { ProviderConfig, ProviderId, ProviderInstance } from "./types";

const fakeModel = {} as BaseChatModel;

type ConfigRow = {
  authMode: string;
  baseURL: string | null;
  enabled: boolean;
  fallbackOrder: number;
  id: string;
  modelName: string | null;
  primaryModel: string;
};

function row(overrides: Partial<ConfigRow>): ConfigRow {
  return {
    authMode: "apiKey",
    baseURL: null,
    enabled: true,
    fallbackOrder: 1,
    id: "openai",
    modelName: null,
    primaryModel: "test-model",
    ...overrides,
  };
}

function provider(
  id: ProviderId,
  {
    config: configOverrides,
    ...overrides
  }: Omit<Partial<ProviderInstance>, "config"> & {
    config?: Partial<ProviderConfig>;
  } = {},
): ProviderInstance {
  return {
    config: {
      authMode: "apiKey",
      enabled: true,
      fallbackOrder: 1,
      id,
      primaryModel: `${id}-model`,
      ...configOverrides,
    },
    createModel: vi.fn().mockResolvedValue(fakeModel),
    description: id,
    id,
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function store(rows: ConfigRow[]) {
  return {
    providerConfig: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
}

describe("ProviderRegistryImpl", () => {
  it("initializes providers from persisted configs and orders fallback chain", async () => {
    const registry = new ProviderRegistryImpl({
      createProvider: (config) =>
        provider(config.id, {
          config,
        }),
      store: store([
        row({ fallbackOrder: 2, id: "anthropic" }),
        row({ enabled: false, fallbackOrder: 1, id: "openai" }),
        row({ fallbackOrder: 3, id: "local" }),
      ]),
    });

    await registry.initialize();

    expect(registry.list().map((item) => item.id)).toEqual([
      "anthropic",
      "openai",
      "local",
    ]);
    expect(registry.getEnabled().map((item) => item.id)).toEqual([
      "anthropic",
      "local",
    ]);
    expect(registry.getFallbackChain().map((item) => item.id)).toEqual([
      "anthropic",
      "local",
    ]);
  });

  it("returns the first available provider model", async () => {
    const openai = provider("openai", {
      config: { fallbackOrder: 1 },
    });
    const anthropic = provider("anthropic", {
      config: { fallbackOrder: 2 },
    });
    const registry = new ProviderRegistryImpl({
      createProvider: (config) => (config.id === "openai" ? openai : anthropic),
      store: store([row({ id: "openai" }), row({ id: "anthropic" })]),
    });

    await registry.initialize();
    await expect(registry.getActiveModel()).resolves.toEqual({
      model: fakeModel,
      provider: openai,
    });
    expect(openai.createModel).toHaveBeenCalledWith(undefined);
    expect(anthropic.createModel).not.toHaveBeenCalled();
  });

  it("falls back and emits provider_fallback after a provider is unavailable", async () => {
    const emitTaskEvent = vi.fn();
    const openai = provider("openai", {
      config: { fallbackOrder: 1 },
      isAvailable: vi.fn().mockResolvedValue(false),
    });
    const anthropic = provider("anthropic", {
      config: { fallbackOrder: 2 },
    });
    const registry = new ProviderRegistryImpl({
      createProvider: (config) => (config.id === "openai" ? openai : anthropic),
      emitTaskEvent,
      store: store([row({ id: "openai" }), row({ id: "anthropic" })]),
    });

    await registry.initialize();
    await expect(
      registry.getActiveModel({ taskId: "task-1" }),
    ).resolves.toEqual({
      model: fakeModel,
      provider: anthropic,
    });

    expect(emitTaskEvent).toHaveBeenCalledWith({
      type: "provider_fallback",
      fromProvider: "openai",
      toProvider: "anthropic",
      reason: "Provider unavailable",
      taskId: "task-1",
    });
  });

  it("falls back after createModel throws and reports tried providers if all fail", async () => {
    const openai = provider("openai", {
      config: { fallbackOrder: 1 },
      createModel: vi.fn().mockRejectedValue(new Error("rate limited")),
    });
    const anthropic = provider("anthropic", {
      config: { fallbackOrder: 2 },
      isAvailable: vi.fn().mockResolvedValue(false),
    });
    const registry = new ProviderRegistryImpl({
      createProvider: (config) => (config.id === "openai" ? openai : anthropic),
      store: store([row({ id: "openai" }), row({ id: "anthropic" })]),
    });

    await registry.initialize();

    await expect(registry.getActiveModel()).rejects.toThrow(
      "No providers available. Tried openai: rate limited; anthropic: Provider unavailable.",
    );
  });

  it("reports a helpful error when ChatGPT OAuth is the only configured provider and is unavailable", async () => {
    const openai = provider("openai", {
      config: { authMode: "chatgpt-oauth", fallbackOrder: 1 },
      isAvailable: vi.fn().mockResolvedValue(false),
    });
    const registry = new ProviderRegistryImpl({
      createProvider: () => openai,
      store: store([
        row({
          authMode: "chatgpt-oauth",
          id: "openai",
          primaryModel: "gpt-5.1",
        }),
      ]),
    });

    await registry.initialize();

    await expect(registry.getActiveModel()).rejects.toThrow(
      "OpenAI ChatGPT Subscription auth failed: not signed in. To enable fallback, also configure your OpenAI API key, Anthropic, OpenRouter, or another provider.",
    );
  });

  it("puts a task override first without duplicating the fallback chain", async () => {
    const openai = provider("openai", {
      config: { fallbackOrder: 1 },
    });
    const openrouter = provider("openrouter", {
      config: { fallbackOrder: 2 },
    });
    const registry = new ProviderRegistryImpl({
      createProvider: (config) =>
        config.id === "openrouter" ? openrouter : openai,
      store: store([row({ id: "openai" }), row({ id: "openrouter" })]),
    });

    await registry.initialize();
    await registry.getActiveModel({
      modelOverride: "override",
      taskOverride: "openrouter",
    });

    expect(openrouter.createModel).toHaveBeenCalledWith("override");
    expect(openai.createModel).not.toHaveBeenCalled();
  });
});
