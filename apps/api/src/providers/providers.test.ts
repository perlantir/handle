import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import type { ProviderConfig } from "./types";

const fakeModel = {} as BaseChatModel;

function config(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    authMode: "apiKey",
    enabled: true,
    fallbackOrder: 1,
    id: "openai",
    primaryModel: "test-model",
    ...overrides,
  };
}

describe("provider implementations", () => {
  it("creates OpenAI chat models with API-key auth only", async () => {
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const createChatModel = vi.fn(() => fakeModel);
    const provider = createOpenAIProvider(config({ id: "openai" }), {
      createChatModel,
      getCredential,
    });

    await expect(provider.createModel()).resolves.toBe(fakeModel);
    await expect(provider.isAvailable()).resolves.toBe(true);

    expect(getCredential).toHaveBeenCalledWith("openai:apiKey");
    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "test-key-not-real",
      model: "test-model",
      streaming: true,
      temperature: 0.7,
    });
  });

  it("keeps OpenAI ChatGPT OAuth disabled until Step 8", async () => {
    const provider = createOpenAIProvider(
      config({ authMode: "chatgpt-oauth", id: "openai" }),
      {
        createChatModel: vi.fn(() => fakeModel),
        getCredential: vi.fn().mockResolvedValue("test-token-not-real"),
      },
    );

    await expect(provider.isAvailable()).resolves.toBe(false);
    await expect(provider.createModel()).rejects.toThrow(
      "OpenAI ChatGPT subscription OAuth is implemented in Phase 2 Step 8",
    );
  });

  it("creates Anthropic chat models with mocked credentials", async () => {
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const createChatModel = vi.fn(() => fakeModel);
    const provider = createAnthropicProvider(config({ id: "anthropic" }), {
      createChatModel,
      getCredential,
    });

    await expect(provider.createModel("override-model")).resolves.toBe(
      fakeModel,
    );

    expect(getCredential).toHaveBeenCalledWith("anthropic:apiKey");
    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "test-key-not-real",
      model: "override-model",
      streaming: true,
      temperature: 0.7,
    });
  });

  it("creates KIMI models with provider base URLs", async () => {
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const createChatModel = vi.fn(() => fakeModel);
    const provider = createOpenAICompatibleProvider(config({ id: "kimi" }), {
      createChatModel,
      getCredential,
    });

    await expect(provider.createModel()).resolves.toBe(fakeModel);
    await expect(provider.isAvailable()).resolves.toBe(true);

    expect(getCredential).toHaveBeenCalledWith("kimi:apiKey");
    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "test-key-not-real",
      configuration: {
        baseURL: "https://api.moonshot.cn/v1",
      },
      model: "test-model",
      streaming: true,
      temperature: 0.7,
    });
  });

  it("adds OpenRouter attribution headers", async () => {
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const createChatModel = vi.fn(() => fakeModel);
    const provider = createOpenAICompatibleProvider(
      config({ id: "openrouter" }),
      {
        createChatModel,
        getCredential,
      },
    );

    await expect(provider.createModel()).resolves.toBe(fakeModel);

    expect(getCredential).toHaveBeenCalledWith("openrouter:apiKey");
    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "test-key-not-real",
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "http://127.0.0.1:3000",
          "X-OpenRouter-Title": "Handle",
          "X-Title": "Handle",
        },
      },
      model: "test-model",
      streaming: true,
      temperature: 0.7,
    });
  });

  it("checks local provider availability through a mocked model-list request", async () => {
    const fetchModels = vi.fn().mockResolvedValue({ ok: true });
    const provider = createOpenAICompatibleProvider(
      config({
        baseURL: "http://127.0.0.1:11434/v1",
        id: "local",
      }),
      {
        createChatModel: vi.fn(() => fakeModel),
        fetchModels,
        getCredential: vi.fn().mockRejectedValue(new Error("missing")),
      },
    );

    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchModels).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/v1/models",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
