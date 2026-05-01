import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export const PROVIDER_IDS = [
  "openai",
  "anthropic",
  "kimi",
  "openrouter",
  "local",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const API_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "kimi",
  "openrouter",
] as const satisfies readonly ProviderId[];

export type ApiProviderId = (typeof API_PROVIDER_IDS)[number];

export type ProviderAuthMode = "apiKey" | "chatgpt-oauth";

export interface ProviderConfig {
  authMode?: ProviderAuthMode;
  baseURL?: string;
  enabled: boolean;
  fallbackOrder: number;
  id: ProviderId;
  modelName?: string;
  primaryModel: string;
}

export interface CreateModelDiagnostics {
  label: string;
}

export interface CreateModelOptions {
  diagnostics?: CreateModelDiagnostics;
}

export interface ProviderInstance {
  config: ProviderConfig;
  createModel(
    modelOverride?: string,
    options?: CreateModelOptions,
  ): Promise<BaseChatModel>;
  description: string;
  id: ProviderId;
  isAvailable(): Promise<boolean>;
}

export interface ActiveProviderModel {
  model: BaseChatModel;
  provider: ProviderInstance;
}

export interface GetActiveProviderModelOptions {
  modelOverride?: string;
  taskId?: string;
  taskOverride?: ProviderId;
}

export interface ProviderRegistry {
  get(id: ProviderId): ProviderInstance | undefined;
  getActiveModel(
    options?: GetActiveProviderModelOptions,
  ): Promise<ActiveProviderModel>;
  getEnabled(): ProviderInstance[];
  getFallbackChain(): ProviderInstance[];
  list(): ProviderInstance[];
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}
