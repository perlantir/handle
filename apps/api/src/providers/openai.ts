import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import type { ProviderConfig, ProviderInstance } from "./types";

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

interface OpenAIProviderDependencies {
  createChatModel?: (args: ChatOpenAIArgs) => BaseChatModel;
  getCredential?: typeof defaultGetCredential;
}

export function createOpenAIProvider(
  config: ProviderConfig,
  {
    createChatModel = (args) => new ChatOpenAI(args),
    getCredential = defaultGetCredential,
  }: OpenAIProviderDependencies = {},
): ProviderInstance {
  return {
    config,
    description: "OpenAI",
    id: "openai",

    async createModel(modelOverride?: string) {
      if (config.authMode === "oauth") {
        throw new Error(
          "OpenAI OAuth for API access is not publicly available; use API key authentication.",
        );
      }

      const apiKey = await getCredential("openai:apiKey");

      return createChatModel({
        apiKey,
        model: modelOverride ?? config.primaryModel,
        streaming: true,
        temperature: 0.7,
      });
    },

    async isAvailable() {
      if (config.authMode === "oauth") return false;

      try {
        await getCredential("openai:apiKey");
        return true;
      } catch {
        return false;
      }
    },
  };
}
