import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import type { ProviderConfig } from "./types";

const fakeModel = {} as BaseChatModel;
type ChatAnthropicArgs = ConstructorParameters<typeof ChatAnthropic>[0];
type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];
type OpenAICompatibleProviderId = "kimi" | "local" | "openrouter";

const omittedOpenAICompatibleSamplingParams = {
  frequency_penalty: undefined,
  n: undefined,
  presence_penalty: undefined,
  temperature: undefined,
  top_p: undefined,
};

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

async function captureOpenAICompatibleRequestBody(
  providerId: OpenAICompatibleProviderId,
) {
  let requestBody: Record<string, unknown> | null = null;
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ error: { message: "capture", type: "capture" } }),
      { headers: { "content-type": "application/json" }, status: 400 },
    );
  });
  const getCredential = vi.fn(async (account: string) => {
    if (account === "local:apiKey") throw new Error("missing");
    return "test-key-not-real";
  });
  const provider = createOpenAICompatibleProvider(
    config({ id: providerId, primaryModel: "test-compatible-model" }),
    {
      createChatModel: (args: ChatOpenAIArgs) => {
        const baseArgs = args ?? {};

        return new ChatOpenAI({
          ...baseArgs,
          configuration: {
            ...baseArgs.configuration,
            fetch,
          },
          maxRetries: 0,
          streaming: false,
        });
      },
      getCredential,
    },
  );

  const model = await provider.createModel();
  await expect(model.invoke([new HumanMessage("hi")])).rejects.toThrow(
    "capture",
  );

  expect(fetch).toHaveBeenCalledOnce();
  return requestBody;
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
      modelKwargs: {
        frequency_penalty: undefined,
        n: undefined,
        presence_penalty: undefined,
        temperature: undefined,
        top_p: undefined,
      },
      model: "test-model",
      streaming: true,
    });
  });

  it("omits OpenAI sampling defaults from the outgoing request body", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ error: { message: "capture", type: "capture" } }),
        { headers: { "content-type": "application/json" }, status: 400 },
      );
    });
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const provider = createOpenAIProvider(
      config({ id: "openai", primaryModel: "gpt-5.2" }),
      {
        createChatModel: (args: ChatOpenAIArgs) =>
          new ChatOpenAI({
            ...args,
            configuration: { fetch },
            maxRetries: 0,
            streaming: false,
          }),
        getCredential,
      },
    );

    const model = await provider.createModel();
    await expect(model.invoke([new HumanMessage("hi")])).rejects.toThrow(
      "capture",
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody).not.toHaveProperty("top_p");
    expect(requestBody).not.toHaveProperty("frequency_penalty");
    expect(requestBody).not.toHaveProperty("presence_penalty");
    expect(requestBody).not.toHaveProperty("n");
  });

  it("starts the ChatGPT OAuth proxy lazily and uses its dynamic base URL", async () => {
    const chatgptOAuthProxy = {
      ensureStarted: vi.fn().mockResolvedValue({
        baseURL: "http://127.0.0.1:1458/v1",
        port: 1458,
        reused: false,
        stop: vi.fn(),
      }),
      stop: vi.fn(),
    };
    const createChatModel = vi.fn(() => fakeModel);
    const readOAuthProfile = vi.fn().mockResolvedValue({
      accessToken: "test-access-token-not-real",
      accountId: "account-123",
      expires: 1_800_000_000_000,
      refreshToken: "test-refresh-token-not-real",
    });
    const provider = createOpenAIProvider(
      config({ authMode: "chatgpt-oauth", id: "openai" }),
      {
        chatgptOAuthProxy,
        createChatModel,
        readOAuthProfile,
      },
    );

    expect(chatgptOAuthProxy.ensureStarted).not.toHaveBeenCalled();
    await expect(provider.isAvailable()).resolves.toBe(true);

    readOAuthProfile.mockClear();
    await expect(provider.createModel("gpt-5.1")).resolves.toBe(fakeModel);

    expect(readOAuthProfile).toHaveBeenCalledOnce();
    expect(chatgptOAuthProxy.ensureStarted).toHaveBeenCalledOnce();
    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "chatgpt-oauth",
      configuration: {
        baseURL: "http://127.0.0.1:1458/v1",
      },
      modelKwargs: {
        frequency_penalty: undefined,
        n: undefined,
        presence_penalty: undefined,
        temperature: undefined,
        top_p: undefined,
      },
      model: "gpt-5.1",
      streaming: true,
    });
  });

  it("marks OpenAI ChatGPT OAuth unavailable when tokens are missing", async () => {
    const provider = createOpenAIProvider(
      config({ authMode: "chatgpt-oauth", id: "openai" }),
      {
        chatgptOAuthProxy: { ensureStarted: vi.fn(), stop: vi.fn() },
        createChatModel: vi.fn(() => fakeModel),
        readOAuthProfile: vi.fn().mockRejectedValue(new Error("missing")),
      },
    );

    await expect(provider.isAvailable()).resolves.toBe(false);
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
      invocationKwargs: {
        temperature: undefined,
        top_k: undefined,
        top_p: undefined,
      },
      model: "override-model",
      streaming: true,
      temperature: null,
      topP: null,
    });
  });

  it("omits Anthropic sampling defaults from the Claude request body", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          error: { message: "capture", type: "capture" },
          type: "error",
        }),
        { headers: { "content-type": "application/json" }, status: 400 },
      );
    });
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const provider = createAnthropicProvider(config({ id: "anthropic" }), {
      createChatModel: (args: ChatAnthropicArgs) =>
        new ChatAnthropic({
          ...args,
          clientOptions: { fetch },
          maxRetries: 0,
          streaming: false,
        }),
      getCredential,
    });

    const model = await provider.createModel("claude-opus-4-7");
    await expect(model.invoke([new HumanMessage("hi")])).rejects.toThrow(
      "capture",
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody).not.toHaveProperty("top_p");
    expect(requestBody).not.toHaveProperty("top_k");
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
        baseURL: "https://api.moonshot.ai/v1",
      },
      modelKwargs: omittedOpenAICompatibleSamplingParams,
      model: "test-model",
      streaming: true,
    });
  });

  it("uses custom KIMI base URLs for regional overrides", async () => {
    const getCredential = vi.fn().mockResolvedValue("test-key-not-real");
    const createChatModel = vi.fn(() => fakeModel);
    const provider = createOpenAICompatibleProvider(
      config({
        baseURL: "https://api.moonshot.cn/v1",
        id: "kimi",
      }),
      {
        createChatModel,
        getCredential,
      },
    );

    await expect(provider.createModel()).resolves.toBe(fakeModel);

    expect(createChatModel).toHaveBeenCalledWith({
      apiKey: "test-key-not-real",
      configuration: {
        baseURL: "https://api.moonshot.cn/v1",
      },
      modelKwargs: omittedOpenAICompatibleSamplingParams,
      model: "test-model",
      streaming: true,
    });
  });

  it.each(["kimi", "openrouter", "local"] as const)(
    "omits OpenAI-compatible sampling defaults for %s request bodies",
    async (providerId) => {
      const requestBody = await captureOpenAICompatibleRequestBody(providerId);

      expect(requestBody).not.toHaveProperty("temperature");
      expect(requestBody).not.toHaveProperty("top_p");
      expect(requestBody).not.toHaveProperty("n");
      expect(requestBody).not.toHaveProperty("presence_penalty");
      expect(requestBody).not.toHaveProperty("frequency_penalty");
    },
  );

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
      modelKwargs: omittedOpenAICompatibleSamplingParams,
      model: "test-model",
      streaming: true,
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
