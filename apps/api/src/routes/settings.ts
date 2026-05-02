import { Router } from "express";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { getAuthenticatedUserId } from "../auth/clerkMiddleware";
import {
  deleteCredential as defaultDeleteCredential,
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
} from "../lib/keychain";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redactSecrets } from "../lib/redact";
import { chatGptOAuthFailureMessage } from "../providers/openaiChatgptAuth";
import {
  createChatGptOAuthService,
  type ChatGptOAuthService,
} from "../providers/openaiChatgptOAuthFlow";
import {
  chatGptOAuthProxyManager,
  type ChatGptOAuthProxyManager,
} from "../providers/openaiChatgptProxy";
import { createProviderInstance } from "../providers/registry";
import {
  isProviderId,
  type ProviderConfig,
  type ProviderId,
  type ProviderInstance,
} from "../providers/types";

const TEST_PROMPT = "Hello, respond with OK.";
const GLOBAL_SETTINGS_ID = "global";
const WORKSPACE_BASE_DIR = join(homedir(), "Documents", "Handle", "workspaces");

const updateProviderSchema = z
  .object({
    baseURL: z.string().url().optional(),
    authMode: z.enum(["apiKey", "chatgpt-oauth"]).optional(),
    enabled: z.boolean().optional(),
    fallbackOrder: z.number().int().min(1).max(100).optional(),
    modelName: z.string().trim().min(1).max(200).optional(),
    primaryModel: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one provider setting is required.",
  });

const setKeySchema = z.object({
  apiKey: z.string(),
});

const updateExecutionSettingsSchema = z
  .object({
    cleanupPolicy: z.literal("keep-all").optional(),
    defaultBackend: z.enum(["e2b", "local"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one execution setting is required.",
  });

const apiKeyFormatDescriptions: Record<ProviderId, string> = {
  anthropic: "sk-ant- followed by 20+ letters, numbers, underscores, or dashes",
  kimi: "sk- followed by 20+ letters, numbers, underscores, or dashes",
  local: "any non-empty string",
  openai:
    "sk- or sk-proj- followed by 20+ letters, numbers, underscores, or dashes",
  openrouter: "sk-or- followed by 20+ letters, numbers, underscores, or dashes",
};

const apiKeyFormatSchema = z.discriminatedUnion("providerId", [
  z.object({
    apiKey: z.string().regex(/^(?:sk|sk-proj)-[A-Za-z0-9_-]{20,}$/),
    providerId: z.literal("openai"),
  }),
  z.object({
    apiKey: z.string().regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/),
    providerId: z.literal("anthropic"),
  }),
  z.object({
    apiKey: z.string().regex(/^sk-[A-Za-z0-9_-]{20,}$/),
    providerId: z.literal("kimi"),
  }),
  z.object({
    apiKey: z.string().regex(/^sk-or-[A-Za-z0-9_-]{20,}$/),
    providerId: z.literal("openrouter"),
  }),
  z.object({
    apiKey: z.string().min(1),
    providerId: z.literal("local"),
  }),
]);

export interface ProviderConfigRow {
  authMode: string;
  baseURL: string | null;
  enabled: boolean;
  fallbackOrder: number;
  id: string;
  modelName: string | null;
  primaryModel: string;
  updatedAt?: Date | string;
}

export interface ExecutionSettingsRow {
  cleanupPolicy: string;
  defaultBackend: string;
  id: string;
  updatedAt?: Date | string;
}

export interface SettingsRouteStore {
  executionSettings?: {
    findUnique(args: unknown): Promise<ExecutionSettingsRow | null>;
    update(args: unknown): Promise<ExecutionSettingsRow>;
    upsert(args: unknown): Promise<ExecutionSettingsRow>;
  };
  providerConfig: {
    findMany(args: unknown): Promise<ProviderConfigRow[]>;
    findUnique(args: unknown): Promise<ProviderConfigRow | null>;
    update(args: unknown): Promise<ProviderConfigRow>;
  };
}

export interface KeychainLike {
  deleteCredential(account: string): Promise<void>;
  getCredential(account: string): Promise<string>;
  setCredential(account: string, value: string): Promise<void>;
}

export type OpenPathInFinder = (path: string) => Promise<void>;

export interface CreateSettingsRouterOptions {
  chatgptOAuthProxy?: Pick<ChatGptOAuthProxyManager, "stop">;
  chatgptOAuthService?: ChatGptOAuthService;
  createProvider?: (config: ProviderConfig) => ProviderInstance;
  getUserId?: typeof getAuthenticatedUserId;
  keychain?: KeychainLike;
  openPathInFinder?: OpenPathInFinder;
  store?: SettingsRouteStore;
}

const DESCRIPTIONS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  kimi: "Moonshot KIMI",
  local: "Local LLM",
  openai: "OpenAI",
  openrouter: "OpenRouter (100+ models from many providers)",
};

function accountForProvider(id: ProviderId) {
  return `${id}:apiKey`;
}

function parseProviderId(value: string | undefined) {
  return value && isProviderId(value) ? value : null;
}

function canUpdateProviderBaseURL(providerId: ProviderId) {
  return providerId === "kimi" || providerId === "local";
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return redactSecrets(err.message);
  if (typeof err === "string") return redactSecrets(err);
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return redactSecrets(err.message);
  }

  return "Unknown provider error";
}

function errorCauseMessage(err: unknown) {
  if (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    err.cause !== undefined
  ) {
    return errorMessage(err.cause);
  }

  return null;
}

function validateApiKeyFormat(providerId: ProviderId, apiKey: string) {
  const result = apiKeyFormatSchema.safeParse({ apiKey, providerId });

  return result.success;
}

function normalizeProviderConfig(
  row: ProviderConfigRow,
): ProviderConfig | null {
  if (!isProviderId(row.id)) return null;

  return {
    authMode: row.authMode === "chatgpt-oauth" ? "chatgpt-oauth" : "apiKey",
    ...(row.baseURL ? { baseURL: row.baseURL } : {}),
    enabled: row.enabled,
    fallbackOrder: row.fallbackOrder,
    id: row.id,
    ...(row.modelName ? { modelName: row.modelName } : {}),
    primaryModel: row.primaryModel,
  };
}

function serializeProvider(row: ProviderConfigRow) {
  const config = normalizeProviderConfig(row);
  if (!config) return null;

  return {
    authMode: config.authMode ?? "apiKey",
    baseURL: config.baseURL ?? null,
    description: DESCRIPTIONS[config.id],
    enabled: config.enabled,
    fallbackOrder: config.fallbackOrder,
    id: config.id,
    modelName: config.modelName ?? null,
    primaryModel: config.primaryModel,
    updatedAt: row.updatedAt ?? null,
  };
}

function normalizeExecutionSettings(row: ExecutionSettingsRow) {
  return {
    cleanupPolicy: row.cleanupPolicy === "keep-all" ? "keep-all" : "keep-all",
    defaultBackend: row.defaultBackend === "local" ? "local" : "e2b",
    updatedAt: row.updatedAt ?? null,
    workspaceBaseDir: WORKSPACE_BASE_DIR,
  };
}

async function defaultOpenPathInFinder(path: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("open", [path], {
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`open exited with code ${code ?? "unknown"}`));
    });
  });
}

async function ensureExecutionSettings(store: SettingsRouteStore) {
  if (!store.executionSettings) {
    throw new Error("Execution settings store is unavailable.");
  }

  return store.executionSettings.upsert({
    create: {
      cleanupPolicy: "keep-all",
      defaultBackend: "e2b",
      id: GLOBAL_SETTINGS_ID,
    },
    update: {},
    where: { id: GLOBAL_SETTINGS_ID },
  });
}

async function hasProviderApiKey(
  providerId: ProviderId,
  keychain: KeychainLike,
) {
  const value = await keychain
    .getCredential(accountForProvider(providerId))
    .catch(() => "");

  return value.length > 0;
}

function contentToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (
          typeof item === "object" &&
          item !== null &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

function modelOutputToString(output: unknown) {
  if (typeof output === "string") return output;
  if (typeof output === "object" && output !== null && "content" in output) {
    return contentToString(output.content);
  }
  return "";
}

export function createSettingsRouter({
  chatgptOAuthProxy = chatGptOAuthProxyManager,
  chatgptOAuthService,
  createProvider = createProviderInstance,
  getUserId = getAuthenticatedUserId,
  keychain = {
    deleteCredential: defaultDeleteCredential,
    getCredential: defaultGetCredential,
    setCredential: defaultSetCredential,
  },
  openPathInFinder = defaultOpenPathInFinder,
  store = prisma,
}: CreateSettingsRouterOptions = {}) {
  const router = Router();
  const chatgptOAuth =
    chatgptOAuthService ?? createChatGptOAuthService({ keychain });

  router.get(
    "/execution",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const row = await ensureExecutionSettings(store);

      return res.json({ execution: normalizeExecutionSettings(row) });
    }),
  );

  router.put(
    "/execution",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateExecutionSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      await ensureExecutionSettings(store);
      if (!store.executionSettings) {
        throw new Error("Execution settings store is unavailable.");
      }

      const row = await store.executionSettings.update({
        data: parsed.data,
        where: { id: GLOBAL_SETTINGS_ID },
      });

      return res.json({ execution: normalizeExecutionSettings(row) });
    }),
  );

  router.post(
    "/execution/open-workspace",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        await openPathInFinder(WORKSPACE_BASE_DIR);
        return res.json({ opened: true, path: WORKSPACE_BASE_DIR });
      } catch (err) {
        logger.error(
          { err, path: WORKSPACE_BASE_DIR },
          "Open workspace folder failed",
        );
        return res.status(500).json({
          error: errorMessage(err),
          opened: false,
          path: WORKSPACE_BASE_DIR,
        });
      }
    }),
  );

  router.get(
    "/providers",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const rows = await store.providerConfig.findMany({
        orderBy: { fallbackOrder: "asc" },
      });

      const providers = await Promise.all(
        rows.map(async (row) => {
          const provider = serializeProvider(row);
          if (!provider) return null;

          return {
            ...provider,
            hasApiKey: await hasProviderApiKey(provider.id, keychain),
          };
        }),
      );

      return res.json({
        providers: providers.filter(
          (row): row is NonNullable<typeof row> => row !== null,
        ),
      });
    }),
  );

  router.put(
    "/providers/:id",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const providerId = parseProviderId(req.params.id);
      if (!providerId) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const parsed = updateProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      if (!canUpdateProviderBaseURL(providerId) && "baseURL" in parsed.data) {
        return res.status(400).json({
          error: "baseURL can only be updated for local or KIMI.",
        });
      }

      if (providerId !== "openai" && "authMode" in parsed.data) {
        return res.status(400).json({
          error: "authMode can only be updated for OpenAI.",
        });
      }

      if (providerId !== "local" && "modelName" in parsed.data) {
        return res.status(400).json({
          error: "modelName can only be updated for local.",
        });
      }

      const existing = await store.providerConfig.findUnique({
        where: { id: providerId },
      });
      if (!existing)
        return res.status(404).json({ error: "Provider not found" });

      const updated = await store.providerConfig.update({
        data: parsed.data,
        where: { id: providerId },
      });

      if (providerId === "openai" && parsed.data.authMode === "apiKey") {
        await chatgptOAuthProxy.stop();
      }

      return res.json({ provider: serializeProvider(updated) });
    }),
  );

  router.post(
    "/providers/:id/key",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const providerId = parseProviderId(req.params.id);
      if (!providerId) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const parsed = setKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      if (!validateApiKeyFormat(providerId, parsed.data.apiKey)) {
        return res.status(400).json({
          error: `Invalid API key format for ${providerId}`,
          expected: apiKeyFormatDescriptions[providerId],
        });
      }

      const account = accountForProvider(providerId);
      await keychain.setCredential(account, parsed.data.apiKey);
      const saved = await keychain.getCredential(account);

      if (saved !== parsed.data.apiKey) {
        return res.status(500).json({
          error: `Keychain write verification failed for ${account}.`,
        });
      }

      return res.json({ providerId, saved: true });
    }),
  );

  router.delete(
    "/providers/:id/key",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const providerId = parseProviderId(req.params.id);
      if (!providerId) {
        return res.status(404).json({ error: "Provider not found" });
      }

      await keychain.deleteCredential(accountForProvider(providerId));

      return res.json({ deleted: true, providerId });
    }),
  );

  router.post(
    "/providers/openai/oauth/start",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const flow = await chatgptOAuth.start(userId);

        return res.json({ ...flow, providerId: "openai" });
      } catch (err) {
        return res.status(502).json({
          error: errorMessage(err),
          providerId: "openai",
        });
      }
    }),
  );

  router.get(
    "/providers/openai/oauth/status",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      return res.json({
        providerId: "openai",
        status: await chatgptOAuth.status(userId),
      });
    }),
  );

  router.post(
    "/providers/openai/oauth/refresh",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        return res.json({
          providerId: "openai",
          status: await chatgptOAuth.refresh(),
        });
      } catch (err) {
        return res.status(502).json({
          error: chatGptOAuthFailureMessage(errorMessage(err)),
          providerId: "openai",
        });
      }
    }),
  );

  router.delete(
    "/providers/openai/oauth/disconnect",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await chatgptOAuth.disconnect();
      await chatgptOAuthProxy.stop();

      return res.json({ disconnected: true, providerId: "openai" });
    }),
  );

  router.post(
    "/providers/:id/test",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const providerId = parseProviderId(req.params.id);
      if (!providerId) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const row = await store.providerConfig.findUnique({
        where: { id: providerId },
      });
      if (!row) return res.status(404).json({ error: "Provider not found" });

      const config = normalizeProviderConfig(row);
      if (!config) return res.status(404).json({ error: "Provider not found" });

      try {
        const diagnostics =
          providerId === "kimi"
            ? { diagnostics: { label: "settings-provider-test" } }
            : undefined;
        const model = await createProvider(config).createModel(
          undefined,
          diagnostics,
        );
        const output = await model.invoke(TEST_PROMPT);
        const response = modelOutputToString(output).trim();

        if (providerId === "kimi") {
          logger.info(
            {
              providerId,
              responsePreview: redactSecrets(response.slice(0, 100)),
            },
            "Provider test diagnostic success",
          );
        }

        if (!/\bOK\b/i.test(response)) {
          return res.status(502).json({
            error: `Provider test expected OK response, received: ${response || "<empty response>"}`,
          });
        }

        return res.json({ ok: true, providerId, response });
      } catch (err) {
        if (providerId === "kimi") {
          logger.error(
            {
              cause: errorCauseMessage(err),
              message: errorMessage(err),
              providerId,
            },
            "Provider test diagnostic failure",
          );
        }

        return res
          .status(502)
          .json({ error: errorMessage(err), ok: false, providerId });
      }
    }),
  );

  return router;
}

export const settingsRouter = createSettingsRouter();
