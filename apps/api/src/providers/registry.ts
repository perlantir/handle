import type { SSEEvent } from "@handle/shared";
import { emitTaskEvent as defaultEmitTaskEvent } from "../lib/eventBus";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import type {
  GetActiveProviderModelOptions,
  ProviderConfig,
  ProviderId,
  ProviderInstance,
  ProviderRegistry,
} from "./types";
import { isProviderId } from "./types";

type ProviderConfigRow = {
  authMode: string;
  baseURL: string | null;
  enabled: boolean;
  fallbackOrder: number;
  id: string;
  modelName: string | null;
  primaryModel: string;
};

interface ProviderConfigStore {
  providerConfig: {
    findMany(): Promise<ProviderConfigRow[]>;
  };
}

type ProviderFactory = (config: ProviderConfig) => ProviderInstance;
type EmitTaskEvent = (event: SSEEvent) => void;

interface ProviderRegistryDependencies {
  createProvider?: ProviderFactory;
  emitTaskEvent?: EmitTaskEvent;
  store?: ProviderConfigStore;
}

function normalizeProviderConfig(
  row: ProviderConfigRow,
): ProviderConfig | null {
  if (!isProviderId(row.id)) {
    logger.warn({ providerId: row.id }, "Ignoring unknown provider config row");
    return null;
  }

  return {
    authMode: row.authMode === "oauth" ? "oauth" : "apiKey",
    ...(row.baseURL ? { baseURL: row.baseURL } : {}),
    enabled: row.enabled,
    fallbackOrder: row.fallbackOrder,
    id: row.id,
    ...(row.modelName ? { modelName: row.modelName } : {}),
    primaryModel: row.primaryModel,
  };
}

function createProvider(config: ProviderConfig): ProviderInstance {
  if (config.id === "openai") return createOpenAIProvider(config);
  if (config.id === "anthropic") return createAnthropicProvider(config);
  return createOpenAICompatibleProvider(config);
}

function failureReason(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown provider error";
}

function uniqueChain(providers: ProviderInstance[]) {
  const seen = new Set<ProviderId>();

  return providers.filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}

export class ProviderRegistryImpl implements ProviderRegistry {
  private providers: Map<ProviderId, ProviderInstance> = new Map();

  private readonly createProvider: ProviderFactory;
  private readonly emitTaskEvent: EmitTaskEvent;
  private readonly store: ProviderConfigStore;

  constructor({
    createProvider: createProviderDependency = createProvider,
    emitTaskEvent = defaultEmitTaskEvent,
    store = prisma,
  }: ProviderRegistryDependencies = {}) {
    this.createProvider = createProviderDependency;
    this.emitTaskEvent = emitTaskEvent;
    this.store = store;
  }

  async initialize() {
    const rows = await this.store.providerConfig.findMany();
    const providers = new Map<ProviderId, ProviderInstance>();

    for (const row of rows) {
      const config = normalizeProviderConfig(row);
      if (!config) continue;
      providers.set(config.id, this.createProvider(config));
    }

    this.providers = providers;
  }

  get(id: ProviderId) {
    return this.providers.get(id);
  }

  async getActiveModel({
    modelOverride,
    taskId,
    taskOverride,
  }: GetActiveProviderModelOptions = {}) {
    const chain = this.getProviderChain(taskOverride);
    const failures: string[] = [];
    let firstFailedProvider: ProviderInstance | null = null;
    let firstFailureReason = "";

    for (const provider of chain) {
      try {
        if (!(await provider.isAvailable())) {
          const reason = "Provider unavailable";
          failures.push(`${provider.id}: ${reason}`);
          firstFailedProvider ??= provider;
          firstFailureReason ||= reason;
          continue;
        }

        const model = await provider.createModel(modelOverride);

        if (
          firstFailedProvider &&
          firstFailedProvider.id !== provider.id &&
          taskId
        ) {
          this.emitTaskEvent({
            type: "provider_fallback",
            fromProvider: firstFailedProvider.id,
            toProvider: provider.id,
            reason: firstFailureReason,
            taskId,
          });
        }

        return { model, provider };
      } catch (err) {
        const reason = failureReason(err);
        failures.push(`${provider.id}: ${reason}`);
        firstFailedProvider ??= provider;
        firstFailureReason ||= reason;
        logger.warn({ err, providerId: provider.id }, "Provider failed");
      }
    }

    const tried = failures.length ? failures.join("; ") : "no providers";
    throw new Error(`No providers available. Tried ${tried}.`);
  }

  getEnabled() {
    return this.list().filter((provider) => provider.config.enabled);
  }

  getFallbackChain() {
    return this.getEnabled().sort(
      (a, b) => a.config.fallbackOrder - b.config.fallbackOrder,
    );
  }

  list() {
    return Array.from(this.providers.values());
  }

  private getProviderChain(taskOverride?: ProviderId) {
    if (!taskOverride) return this.getFallbackChain();

    const overrideProvider = this.get(taskOverride);
    const providers = overrideProvider
      ? [overrideProvider, ...this.getFallbackChain()]
      : this.getFallbackChain();

    return uniqueChain(providers);
  }
}

export const providerRegistry = new ProviderRegistryImpl();
