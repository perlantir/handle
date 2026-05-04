import { Router } from "express";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
import {
  DEFAULT_ACTUAL_CHROME_ENDPOINT,
  defaultLocalBrowserProfileDir,
  testActualChromeConnection as defaultTestActualChromeConnection,
} from "../execution/localBrowser";
import { chatGptOAuthFailureMessage } from "../providers/openaiChatgptAuth";
import {
  createChatGptOAuthService,
  type ChatGptOAuthService,
} from "../providers/openaiChatgptOAuthFlow";
import {
  chatGptOAuthProxyManager,
  type ChatGptOAuthProxyManager,
} from "../providers/openaiChatgptProxy";
import {
  accountForProvider,
  hasProviderApiKey,
  keyedProvidersForFreshInstall,
} from "../providers/providerCredentials";
import { createProviderInstance } from "../providers/registry";
import {
  isProviderId,
  type ProviderConfig,
  type ProviderId,
  type ProviderInstance,
} from "../providers/types";
import { HandleZepClient, type MemoryStatusSnapshot } from "../memory/zepClient";
import type { MemoryProvider } from "../memory/memoryLog";
import { createNangoService } from "../integrations/nango/nangoService";
import {
  IntegrationError,
  integrationErrorCode,
  integrationErrorMessage,
} from "../integrations/nango/errors";
import { connectorById } from "../integrations/nango/connectors";
import type {
  IntegrationConnectorId,
  IntegrationSettingsResponse,
} from "@handle/shared";

const TEST_PROMPT = "Hello, respond with OK.";
const GLOBAL_SETTINGS_ID = "global";
const WORKSPACE_BASE_DIR = join(homedir(), "Documents", "Handle", "workspaces");
const ACTUAL_CHROME_ENDPOINT = DEFAULT_ACTUAL_CHROME_ENDPOINT;
const ZEP_CLOUD_API_KEY_ACCOUNT = "zep:cloud:apiKey";

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

const updateBrowserSettingsSchema = z
  .object({
    mode: z.enum(["separate-profile", "actual-chrome"]),
  })
  .strict();

const updateMemorySettingsSchema = z
  .object({
    cloudBaseURL: z.string().url().nullable().optional(),
    defaultScopeForNewProjects: z
      .enum(["GLOBAL_AND_PROJECT", "PROJECT_ONLY", "NONE"])
      .optional(),
    provider: z.enum(["self-hosted", "cloud"]).optional(),
    selfHostedBaseURL: z.string().url().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one memory setting is required.",
  });

const setMemoryCloudKeySchema = z.object({
  apiKey: z.string().min(1),
});

const saveNangoSecretSchema = z
  .object({
    host: z.string().url().optional(),
    secretKey: z.string().min(1),
  })
  .strict();

const saveConnectorOAuthAppSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  })
  .strict();

const resetMemorySchema = z.object({
  confirmation: z.literal("delete"),
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

export interface BrowserSettingsRow {
  id: string;
  mode: string;
  updatedAt?: Date | string;
}

export interface MemorySettingsRow {
  cloudBaseURL: string | null;
  defaultScopeForNewProjects: string;
  id: string;
  provider: string;
  selfHostedBaseURL: string;
  updatedAt?: Date | string;
}

export interface SettingsRouteStore {
  browserSettings?: {
    update(args: unknown): Promise<BrowserSettingsRow>;
    upsert(args: unknown): Promise<BrowserSettingsRow>;
  };
  executionSettings?: {
    findUnique(args: unknown): Promise<ExecutionSettingsRow | null>;
    update(args: unknown): Promise<ExecutionSettingsRow>;
    upsert(args: unknown): Promise<ExecutionSettingsRow>;
  };
  memorySettings?: {
    update(args: unknown): Promise<MemorySettingsRow>;
    upsert(args: unknown): Promise<MemorySettingsRow>;
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
export type ResetBrowserProfile = (path: string) => Promise<void>;
export type TestActualChromeConnection = (
  endpoint: string,
) => Promise<{ connected: boolean; detail: string | null }>;
export type RunMemoryComposeCommand = (
  action: "down" | "up",
) => Promise<{ stderr: string; stdout: string }>;

export interface CreateSettingsRouterOptions {
  chatgptOAuthProxy?: Pick<ChatGptOAuthProxyManager, "stop">;
  chatgptOAuthService?: ChatGptOAuthService;
  createProvider?: (config: ProviderConfig) => ProviderInstance;
  getUserId?: typeof getAuthenticatedUserId;
  keychain?: KeychainLike;
  openPathInFinder?: OpenPathInFinder;
  resetBrowserProfile?: ResetBrowserProfile;
  runMemoryComposeCommand?: RunMemoryComposeCommand;
  nangoService?: {
    listSettings(userId: string): Promise<IntegrationSettingsResponse>;
    saveConnectorOAuthApp(input: {
      clientId: string;
      clientSecret: string;
      connectorId: IntegrationConnectorId;
    }): Promise<unknown>;
    saveNangoSecret(input: { host?: string; secretKey: string }): Promise<unknown>;
    validateNangoSecret(): Promise<unknown>;
  };
  store?: SettingsRouteStore;
  testActualChromeConnection?: TestActualChromeConnection;
}

const DESCRIPTIONS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  kimi: "Moonshot KIMI",
  local: "Local LLM",
  openai: "OpenAI",
  openrouter: "OpenRouter (100+ models from many providers)",
};

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

function integrationHttpStatus(err: unknown) {
  if (err instanceof IntegrationError) {
    if (err.code === "validation_error") return 400;
    if (err.code === "nango_not_configured" || err.code === "settings_invalid") {
      return 409;
    }
    if (err.code === "not_connected" || err.code === "provider_not_found") return 404;
    if (err.code === "rate_limited") return 429;
    if (err.status && err.status >= 400 && err.status < 500) return err.status;
  }
  return 500;
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

function normalizeBrowserSettings(row: BrowserSettingsRow) {
  return {
    actualChromeEndpoint: ACTUAL_CHROME_ENDPOINT,
    mode: row.mode === "actual-chrome" ? "actual-chrome" : "separate-profile",
    profileDir: defaultLocalBrowserProfileDir(),
    updatedAt: row.updatedAt ?? null,
  };
}

function normalizeMemorySettings(row: MemorySettingsRow, status: MemoryStatusSnapshot | null, hasCloudApiKey: boolean) {
  return {
    cloudBaseURL: row.cloudBaseURL ?? "https://api.getzep.com",
    defaultScopeForNewProjects:
      row.defaultScopeForNewProjects === "PROJECT_ONLY" || row.defaultScopeForNewProjects === "NONE"
        ? row.defaultScopeForNewProjects
        : "GLOBAL_AND_PROJECT",
    hasCloudApiKey,
    provider: row.provider === "cloud" ? "cloud" : "self-hosted",
    selfHostedBaseURL: row.selfHostedBaseURL || "http://127.0.0.1:8000",
    status: status ?? {
      checkedAt: new Date().toISOString(),
      detail: "Memory status has not been checked",
      provider: row.provider === "cloud" ? "cloud" : "self-hosted",
      status: "offline",
    },
    updatedAt: row.updatedAt ?? null,
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

async function defaultResetBrowserProfile(path: string) {
  await fs.rm(path, { force: true, recursive: true });
}

async function findRepoRoot(start = process.cwd()) {
  let current = start;
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      await fs.access(join(current, "docker-compose.zep.yaml"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error("Could not find docker-compose.zep.yaml from current process directory.");
}

async function defaultRunMemoryComposeCommand(action: "down" | "up") {
  const root = await findRepoRoot();
  const dockerConfig = process.env.DOCKER_CONFIG || "/tmp/handle-docker-config";
  await fs.mkdir(dockerConfig, { recursive: true });
  const args =
    action === "up"
      ? ["compose", "-f", "docker-compose.zep.yaml", "up", "-d"]
      : ["compose", "-f", "docker-compose.zep.yaml", "down"];

  return new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      env: {
        ...process.env,
        DOCKER_CONFIG: dockerConfig,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stderr, stdout });
      else reject(new Error(`docker compose memory ${action} exited with code ${code ?? "unknown"}: ${stderr || stdout}`));
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

async function ensureBrowserSettings(store: SettingsRouteStore) {
  if (!store.browserSettings) {
    throw new Error("Browser settings store is unavailable.");
  }

  return store.browserSettings.upsert({
    create: {
      id: GLOBAL_SETTINGS_ID,
      mode: "separate-profile",
    },
    update: {},
    where: { id: GLOBAL_SETTINGS_ID },
  });
}

async function ensureMemorySettings(store: SettingsRouteStore) {
  if (!store.memorySettings) {
    throw new Error("Memory settings store is unavailable.");
  }

  return store.memorySettings.upsert({
    create: {
      cloudBaseURL: null,
      defaultScopeForNewProjects: "GLOBAL_AND_PROJECT",
      id: GLOBAL_SETTINGS_ID,
      provider: "self-hosted",
      selfHostedBaseURL: "http://127.0.0.1:8000",
    },
    update: {},
    where: { id: GLOBAL_SETTINGS_ID },
  });
}

async function memoryStatusForSettings(row: MemorySettingsRow, keychain: KeychainLike) {
  const provider: MemoryProvider = row.provider === "cloud" ? "cloud" : "self-hosted";
  const apiKey =
    provider === "cloud"
      ? await keychain.getCredential(ZEP_CLOUD_API_KEY_ACCOUNT).catch(() => "")
      : "";
  const client = new HandleZepClient({
    ...(apiKey ? { apiKey } : {}),
    baseUrl:
      provider === "cloud"
        ? row.cloudBaseURL || "https://api.getzep.com"
        : row.selfHostedBaseURL || "http://127.0.0.1:8000",
    provider,
  });
  return {
    hasCloudApiKey: apiKey.length > 0,
    status: await client.checkConnection(),
  };
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
  resetBrowserProfile = defaultResetBrowserProfile,
  runMemoryComposeCommand = defaultRunMemoryComposeCommand,
  nangoService,
  store = prisma,
  testActualChromeConnection = defaultTestActualChromeConnection,
}: CreateSettingsRouterOptions = {}) {
  const router = Router();
  const chatgptOAuth =
    chatgptOAuthService ?? createChatGptOAuthService({ keychain });
  const integrations =
    nangoService ??
    createNangoService({
      keychain,
      prisma,
    });

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
    "/memory",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const row = await ensureMemorySettings(store);
      const { hasCloudApiKey, status } = await memoryStatusForSettings(row, keychain);

      return res.json({ memory: normalizeMemorySettings(row, status, hasCloudApiKey) });
    }),
  );

  router.put(
    "/memory",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateMemorySettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      await ensureMemorySettings(store);
      if (!store.memorySettings) {
        throw new Error("Memory settings store is unavailable.");
      }

      const row = await store.memorySettings.update({
        data: parsed.data,
        where: { id: GLOBAL_SETTINGS_ID },
      });
      const { hasCloudApiKey, status } = await memoryStatusForSettings(row, keychain);

      return res.json({ memory: normalizeMemorySettings(row, status, hasCloudApiKey) });
    }),
  );

  router.post(
    "/memory/cloud-key",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = setMemoryCloudKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      await keychain.setCredential(ZEP_CLOUD_API_KEY_ACCOUNT, parsed.data.apiKey);
      return res.json({ saved: true });
    }),
  );

  router.post(
    "/memory/start",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const result = await runMemoryComposeCommand("up");
        return res.json({ started: true, ...result });
      } catch (err) {
        logger.error({ err }, "Memory Docker Compose start failed");
        return res.status(500).json({ error: errorMessage(err), started: false });
      }
    }),
  );

  router.post(
    "/memory/stop",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const result = await runMemoryComposeCommand("down");
        return res.json({ stopped: true, ...result });
      } catch (err) {
        logger.error({ err }, "Memory Docker Compose stop failed");
        return res.status(500).json({ error: errorMessage(err), stopped: false });
      }
    }),
  );

  router.post(
    "/memory/reset",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = resetMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Type delete to reset memory.", details: parsed.error.flatten() });
      }

      const row = await ensureMemorySettings(store);
      const provider: MemoryProvider = row.provider === "cloud" ? "cloud" : "self-hosted";
      const apiKey =
        provider === "cloud"
          ? await keychain.getCredential(ZEP_CLOUD_API_KEY_ACCOUNT).catch(() => "")
          : "";
      const client = new HandleZepClient({
        ...(apiKey ? { apiKey } : {}),
        baseUrl:
          provider === "cloud"
            ? row.cloudBaseURL || "https://api.getzep.com"
            : row.selfHostedBaseURL || "http://127.0.0.1:8000",
        provider,
      });
      const sessions = await client.listSessions();
      if (!sessions.ok) {
        return res.status(503).json({
          deleted: 0,
          error: sessions.detail ?? "Memory is offline",
        });
      }

      let deleted = 0;
      for (const session of sessions.value ?? []) {
        const result = await client.deleteSessionMemory({ sessionId: session.sessionId });
        if (result.ok) deleted += 1;
      }
      return res.json({ deleted, reset: true });
    }),
  );

  router.get(
    "/integrations",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const settings = await integrations.listSettings(userId);
      return res.json(settings);
    }),
  );

  router.post(
    "/integrations/nango",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = saveNangoSecretSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      try {
        const nango = await integrations.saveNangoSecret({
          secretKey: parsed.data.secretKey,
          ...(parsed.data.host ? { host: parsed.data.host } : {}),
        });
        const validation = await integrations.validateNangoSecret();
        return res.json({ nango, validation });
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json({
          code: integrationErrorCode(err),
          error: integrationErrorMessage(err),
        });
      }
    }),
  );

  router.post(
    "/integrations/:connectorId/oauth-app",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const connectorId = req.params.connectorId;
      const connector = connectorId ? connectorById(connectorId) : null;
      if (!connector) {
        return res.status(404).json({ error: "Unknown integration connector." });
      }

      const parsed = saveConnectorOAuthAppSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      try {
        const result = await integrations.saveConnectorOAuthApp({
          clientId: parsed.data.clientId,
          clientSecret: parsed.data.clientSecret,
          connectorId: connector.connectorId,
        });
        return res.json(result);
      } catch (err) {
        return res.status(integrationHttpStatus(err)).json({
          code: integrationErrorCode(err),
          error: integrationErrorMessage(err),
        });
      }
    }),
  );

  router.get(
    "/browser",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const row = await ensureBrowserSettings(store);

      return res.json({ browser: normalizeBrowserSettings(row) });
    }),
  );

  router.put(
    "/browser",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateBrowserSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      await ensureBrowserSettings(store);
      if (!store.browserSettings) {
        throw new Error("Browser settings store is unavailable.");
      }

      const row = await store.browserSettings.update({
        data: parsed.data,
        where: { id: GLOBAL_SETTINGS_ID },
      });

      return res.json({ browser: normalizeBrowserSettings(row) });
    }),
  );

  router.post(
    "/browser/reset-profile",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const profileDir = defaultLocalBrowserProfileDir();
      try {
        await resetBrowserProfile(profileDir);
        return res.json({ profileDir, reset: true });
      } catch (err) {
        logger.error({ err, profileDir }, "Reset browser profile failed");
        return res.status(500).json({
          error: errorMessage(err),
          profileDir,
          reset: false,
        });
      }
    }),
  );

  router.post(
    "/browser/test-actual-chrome",
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await testActualChromeConnection(ACTUAL_CHROME_ENDPOINT);
      return res.json({
        ...result,
        endpoint: ACTUAL_CHROME_ENDPOINT,
      });
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
      const freshInstallEnabledProviderIds = await keyedProvidersForFreshInstall(
        rows,
        keychain,
      );

      const providers = await Promise.all(
        rows.map(async (row) => {
          const effectiveRow = freshInstallEnabledProviderIds.has(row.id)
            ? { ...row, enabled: true }
            : row;
          const provider = serializeProvider(effectiveRow);
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
