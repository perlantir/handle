import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export const PROVIDER_IDS = [
  "openai",
  "anthropic",
  "qwen",
  "kimi",
  "xai",
  "local",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const API_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "qwen",
  "kimi",
  "xai",
] as const satisfies readonly ProviderId[];

export type ApiProviderId = (typeof API_PROVIDER_IDS)[number];

export type ProviderAuthMode = "apiKey" | "oauth";

export interface ProviderConfig {
  authMode?: ProviderAuthMode;
  baseURL?: string;
  enabled: boolean;
  fallbackOrder: number;
  id: ProviderId;
  modelName?: string;
  primaryModel: string;
}

export interface ProviderInstance {
  config: ProviderConfig;
  createModel(modelOverride?: string): Promise<BaseChatModel>;
  description: string;
  id: ProviderId;
  isAvailable(): Promise<boolean>;
}

export interface ActiveProviderModel {
  model: BaseChatModel;
  provider: ProviderInstance;
}

export interface ProviderRegistry {
  get(id: ProviderId): ProviderInstance | undefined;
  getActiveModel(taskOverride?: ProviderId): Promise<ActiveProviderModel>;
  getEnabled(): ProviderInstance[];
  getFallbackChain(): ProviderInstance[];
  list(): ProviderInstance[];
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}
