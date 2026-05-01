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
  kimi: "https://api.moonshot.cn/v1",
  local: "http://127.0.0.1:11434/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  xai: "https://api.x.ai/v1",
};

const DESCRIPTIONS: Record<OpenAICompatibleProviderId, string> = {
  kimi: "Moonshot KIMI",
  local: "Local LLM",
  qwen: "Alibaba QWEN",
  xai: "xAI",
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
        configuration: { baseURL },
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
