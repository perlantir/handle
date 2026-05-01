import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import type { ProviderConfig, ProviderInstance } from "./types";

type ChatAnthropicArgs = ConstructorParameters<typeof ChatAnthropic>[0];

const omittedSamplingParams = {
  invocationKwargs: {
    temperature: undefined,
    top_k: undefined,
    top_p: undefined,
  },
  temperature: null,
  topP: null,
} satisfies Partial<ChatAnthropicArgs>;

interface AnthropicProviderDependencies {
  createChatModel?: (args: ChatAnthropicArgs) => BaseChatModel;
  getCredential?: typeof defaultGetCredential;
}

export function createAnthropicProvider(
  config: ProviderConfig,
  {
    createChatModel = (args) => new ChatAnthropic(args),
    getCredential = defaultGetCredential,
  }: AnthropicProviderDependencies = {},
): ProviderInstance {
  return {
    config,
    description: "Anthropic",
    id: "anthropic",

    async createModel(modelOverride?: string) {
      const apiKey = await getCredential("anthropic:apiKey");

      return createChatModel({
        apiKey,
        ...omittedSamplingParams,
        model: modelOverride ?? config.primaryModel,
        streaming: true,
      });
    },

    async isAvailable() {
      try {
        await getCredential("anthropic:apiKey");
        return true;
      } catch {
        return false;
      }
    },
  };
}
