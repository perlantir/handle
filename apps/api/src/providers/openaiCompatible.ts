import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import type { ProviderConfig, ProviderId, ProviderInstance } from "./types";

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

type OpenAICompatibleProviderId = Exclude<ProviderId, "openai" | "anthropic">;

export const OPENAI_COMPATIBLE_ENDPOINTS: Record<
  OpenAICompatibleProviderId,
  string
> = {
  kimi: "https://api.moonshot.ai/v1",
  local: "http://127.0.0.1:11434/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const DESCRIPTIONS: Record<OpenAICompatibleProviderId, string> = {
  kimi: "Moonshot KIMI",
  local: "Local LLM",
  openrouter: "OpenRouter (100+ models from many providers)",
};

interface OpenAICompatibleProviderDependencies {
  createChatModel?: (args: ChatOpenAIArgs) => BaseChatModel;
  fetchModels?: typeof fetch;
  getCredential?: typeof defaultGetCredential;
}

function isOpenAICompatibleProviderId(
  id: ProviderId,
): id is OpenAICompatibleProviderId {
  return id !== "openai" && id !== "anthropic";
}

function modelListURL(baseURL: string) {
  return `${baseURL.replace(/\/$/, "")}/models`;
}

function getOpenRouterHeaders() {
  const appURL =
    process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const appTitle = process.env.HANDLE_OPENROUTER_TITLE ?? "Handle";

  return {
    "HTTP-Referer": appURL,
    "X-OpenRouter-Title": appTitle,
    "X-Title": appTitle,
  };
}

export function createOpenAICompatibleProvider(
  config: ProviderConfig,
  {
    createChatModel = (args) => new ChatOpenAI(args),
    fetchModels = fetch,
    getCredential = defaultGetCredential,
  }: OpenAICompatibleProviderDependencies = {},
): ProviderInstance {
  if (!isOpenAICompatibleProviderId(config.id)) {
    throw new Error(`Unsupported OpenAI-compatible provider: ${config.id}`);
  }

  const id = config.id;

  return {
    config,
    description: DESCRIPTIONS[id],
    id,

    async createModel(modelOverride?: string) {
      const apiKey =
        id === "local"
          ? await getCredential("local:apiKey").catch(() => "not-needed")
          : await getCredential(`${id}:apiKey`);
      const baseURL = config.baseURL ?? OPENAI_COMPATIBLE_ENDPOINTS[id];

      return createChatModel({
        apiKey,
        configuration: {
          baseURL,
          ...(id === "openrouter"
            ? { defaultHeaders: getOpenRouterHeaders() }
            : {}),
        },
        model: modelOverride ?? config.primaryModel,
        streaming: true,
        temperature: 0.7,
      });
    },

    async isAvailable() {
      if (id === "local") {
        const baseURL = config.baseURL ?? OPENAI_COMPATIBLE_ENDPOINTS.local;

        try {
          const res = await fetchModels(modelListURL(baseURL), {
            signal: AbortSignal.timeout(2000),
          });
          return res.ok;
        } catch {
          return false;
        }
      }

      try {
        await getCredential(`${id}:apiKey`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
