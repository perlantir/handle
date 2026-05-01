import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import type { ProviderConfig, ProviderInstance } from "./types";

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

const omittedSamplingParams = {
  frequency_penalty: undefined,
  n: undefined,
  presence_penalty: undefined,
  temperature: undefined,
  top_p: undefined,
};

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
      if (config.authMode === "chatgpt-oauth") {
        throw new Error(
          "OpenAI ChatGPT subscription OAuth is implemented in Phase 2 Step 8; use API key authentication for now.",
        );
      }

      const apiKey = await getCredential("openai:apiKey");

      return createChatModel({
        apiKey,
        modelKwargs: omittedSamplingParams,
        model: modelOverride ?? config.primaryModel,
        streaming: true,
      });
    },

    async isAvailable() {
      if (config.authMode === "chatgpt-oauth") return false;

      try {
        await getCredential("openai:apiKey");
        return true;
      } catch {
        return false;
      }
    },
  };
}
