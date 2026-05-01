import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { getCredential as defaultGetCredential } from "../lib/keychain";
import {
  chatGptOAuthFailureMessage,
  readChatGptOAuthProfile,
} from "./openaiChatgptAuth";
import {
  chatGptOAuthProxyManager,
  type ChatGptOAuthProxyManager,
} from "./openaiChatgptProxy";
import type { ProviderConfig, ProviderInstance } from "./types";

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];
type ReadChatGptOAuthProfile = typeof readChatGptOAuthProfile;

const omittedSamplingParams = {
  frequency_penalty: undefined,
  n: undefined,
  presence_penalty: undefined,
  temperature: undefined,
  top_p: undefined,
};

interface OpenAIProviderDependencies {
  chatgptOAuthProxy?: ChatGptOAuthProxyManager;
  createChatModel?: (args: ChatOpenAIArgs) => BaseChatModel;
  getCredential?: typeof defaultGetCredential;
  readOAuthProfile?: ReadChatGptOAuthProfile;
}

export function createOpenAIProvider(
  config: ProviderConfig,
  {
    chatgptOAuthProxy = chatGptOAuthProxyManager,
    createChatModel = (args) => new ChatOpenAI(args),
    getCredential = defaultGetCredential,
    readOAuthProfile = readChatGptOAuthProfile,
  }: OpenAIProviderDependencies = {},
): ProviderInstance {
  return {
    config,
    description: "OpenAI",
    id: "openai",

    async createModel(modelOverride, options) {
      const streaming = options?.streaming ?? true;

      if (config.authMode === "chatgpt-oauth") {
        let proxy: Awaited<
          ReturnType<ChatGptOAuthProxyManager["ensureStarted"]>
        >;
        try {
          await readOAuthProfile();
          proxy = await chatgptOAuthProxy.ensureStarted();
        } catch (err) {
          throw new Error(
            chatGptOAuthFailureMessage(
              err instanceof Error ? err.message : String(err),
            ),
          );
        }

        return createChatModel({
          apiKey: "chatgpt-oauth",
          configuration: {
            baseURL: proxy.baseURL,
          },
          modelKwargs: omittedSamplingParams,
          model: modelOverride ?? config.primaryModel,
          streaming,
        });
      }

      const apiKey = await getCredential("openai:apiKey");

      return createChatModel({
        apiKey,
        modelKwargs: omittedSamplingParams,
        model: modelOverride ?? config.primaryModel,
        streaming,
      });
    },

    async isAvailable() {
      if (config.authMode === "chatgpt-oauth") {
        try {
          await readOAuthProfile();
          return true;
        } catch {
          return false;
        }
      }

      try {
        await getCredential("openai:apiKey");
        return true;
      } catch {
        return false;
      }
    },
  };
}
