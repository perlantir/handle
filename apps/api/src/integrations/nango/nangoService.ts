import type {
  IntegrationConnectionStatus,
  IntegrationConnectorId,
  IntegrationSettingsResponse,
  MemoryScope,
} from "@handle/shared";
import type { PrismaClient } from "@prisma/client";
import { realpath, stat } from "node:fs/promises";
import type { Logger } from "pino";
import { logger as defaultLogger } from "../../lib/logger";
import {
  connectorById,
  connectorByPrismaId,
  connectorMetadata,
  connectorOrder,
  connectorScopesString,
  NANGO_REDIRECT_URI,
  type IntegrationConnectorMetadata,
} from "./connectors";
import {
  IntegrationError,
  errorStatus,
  integrationErrorCode,
  integrationErrorMessage,
} from "./errors";
import {
  DEFAULT_NANGO_HOST,
  defaultNangoClientFactory,
  type NangoClient,
  type NangoClientFactory,
} from "./nangoClient";

const GLOBAL_SETTINGS_ID = "global";
export const NANGO_SECRET_KEY_ACCOUNT = "nango:secret-key";

export function connectorSecretAccount(connectorId: IntegrationConnectorId) {
  return `nango:connector:${connectorId}:client-secret`;
}

export interface IntegrationKeychain {
  deleteCredential(account: string): Promise<void>;
  getCredential(account: string): Promise<string>;
  setCredential(account: string, value: string): Promise<void>;
}

export interface NangoServiceOptions {
  keychain: IntegrationKeychain;
  logger?: Logger;
  nangoClientFactory?: NangoClientFactory;
  prisma: PrismaClient;
}

export interface SaveNangoSecretInput {
  host?: string;
  secretKey: string;
}

export interface SaveConnectorOAuthAppInput {
  clientId: string;
  clientSecret: string;
  connectorId: IntegrationConnectorId;
}

export interface ConnectSessionInput {
  accountAlias?: string;
  connectorId: IntegrationConnectorId;
  userId: string;
}

export interface CompleteConnectionInput {
  accountAlias?: string;
  accountLabel?: string;
  connectorId: IntegrationConnectorId;
  connectionId?: string;
  userId: string;
}

export interface SaveLocalVaultInput {
  accountAlias?: string;
  memoryScope?: MemoryScope;
  userId: string;
  vaultPath: string;
}

export interface UpdateIntegrationInput {
  accountAlias?: string;
  accountLabel?: string | null;
  defaultAccount?: boolean;
  integrationId: string;
  memoryScope?: MemoryScope;
  userId: string;
}

export type IntegrationRequestMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface IntegrationRequestInput {
  accountAlias?: string;
  baseUrlOverride?: string;
  connectorId: IntegrationConnectorId;
  data?: unknown;
  endpoint: string;
  method?: IntegrationRequestMethod;
  params?: Record<string, unknown>;
  userId: string;
}

export function createNangoService({
  keychain,
  logger = defaultLogger,
  nangoClientFactory = defaultNangoClientFactory,
  prisma,
}: NangoServiceOptions) {
  async function ensureNangoSettings() {
    try {
      return await prisma.nangoSettings.upsert({
        create: {
          configured: false,
          host: DEFAULT_NANGO_HOST,
          id: GLOBAL_SETTINGS_ID,
        },
        update: {},
        where: { id: GLOBAL_SETTINGS_ID },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      const existing = await prisma.nangoSettings.findUnique({
        where: { id: GLOBAL_SETTINGS_ID },
      });
      if (existing) return existing;
      throw err;
    }
  }

  async function getSecretKey() {
    const row = await ensureNangoSettings();
    if (!row.configured || !row.secretKeyRef) {
      throw new IntegrationError({
        code: "nango_not_configured",
        message: "Nango is not configured. Add your Nango secret key in Settings -> Integrations.",
      });
    }

    return {
      host: row.host || DEFAULT_NANGO_HOST,
      secretKey: await keychain.getCredential(row.secretKeyRef),
    };
  }

  async function getClient(): Promise<NangoClient> {
    const config = await getSecretKey();
    return nangoClientFactory(config);
  }

  async function ensureConnectorSettings(connector: IntegrationConnectorMetadata) {
    const setupStatus =
      connector.authType === "local-vault" ? "local_vault" : "missing_credentials";
    const args = {
      create: {
        connectorId: connector.prismaId,
        nangoIntegrationId: connector.nangoIntegrationId,
        nangoProviderId: connector.nangoProviderId,
        redirectUri: connector.authType === "nango" ? NANGO_REDIRECT_URI : null,
        requiredScopes: connector.requiredScopes,
        setupStatus,
      },
      update: {
        nangoIntegrationId: connector.nangoIntegrationId,
        nangoProviderId: connector.nangoProviderId,
        redirectUri: connector.authType === "nango" ? NANGO_REDIRECT_URI : null,
        requiredScopes: connector.requiredScopes,
        ...(connector.authType === "local-vault" ? { setupStatus } : {}),
      },
      where: { connectorId: connector.prismaId },
    };
    try {
      return await prisma.integrationConnectorSettings.upsert(args);
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      return prisma.integrationConnectorSettings.update({
        data: args.update,
        where: args.where,
      });
    }
  }

  async function listSettings(userId: string): Promise<IntegrationSettingsResponse> {
    const nango = await ensureNangoSettings();
    const connectorSettingsRows = await Promise.all(
      connectorOrder.map((connectorId) =>
        ensureConnectorSettings(connectorMetadata[connectorId]),
      ),
    );
    const connections = await prisma.integration.findMany({
      orderBy: [{ connectorId: "asc" }, { accountAlias: "asc" }],
      where: { userId },
    });

    return {
      connections: connections.map(serializeConnection),
      connectorSettings: connectorSettingsRows.map(serializeConnectorSettings),
      connectors: connectorOrder.map((connectorId) =>
        serializeConnector(connectorMetadata[connectorId]),
      ),
      nango: {
        configured: nango.configured,
        host: nango.host,
        lastErrorCode: nango.lastErrorCode,
        lastErrorMessage: nango.lastErrorMessage,
        lastValidatedAt: nango.lastValidatedAt?.toISOString() ?? null,
        updatedAt: nango.updatedAt?.toISOString() ?? null,
      },
    };
  }

  async function saveNangoSecret({ host, secretKey }: SaveNangoSecretInput) {
    const trimmed = secretKey.trim();
    if (!trimmed) {
      throw new IntegrationError({
        code: "validation_error",
        message: "Nango secret key is required.",
      });
    }

    await keychain.setCredential(NANGO_SECRET_KEY_ACCOUNT, trimmed);
    const nextHost = host?.trim() || DEFAULT_NANGO_HOST;
    const row = await prisma.nangoSettings.upsert({
      create: {
        configured: true,
        host: nextHost,
        id: GLOBAL_SETTINGS_ID,
        lastErrorCode: null,
        lastErrorMessage: null,
        secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
      },
      update: {
        configured: true,
        host: nextHost,
        lastErrorCode: null,
        lastErrorMessage: null,
        secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
      },
      where: { id: GLOBAL_SETTINGS_ID },
    });

    return {
      configured: row.configured,
      host: row.host,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  async function validateNangoSecret() {
    const started = Date.now();
    try {
      const client = await getClient();
      await client.listIntegrations();
      const row = await prisma.nangoSettings.update({
        data: {
          configured: true,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastValidatedAt: new Date(),
        },
        where: { id: GLOBAL_SETTINGS_ID },
      });
      logger.info(
        { durationMs: Date.now() - started },
        "Nango settings validation succeeded",
      );
      return {
        ok: true,
        nango: {
          configured: row.configured,
          host: row.host,
          lastErrorCode: row.lastErrorCode,
          lastErrorMessage: row.lastErrorMessage,
          lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt?.toISOString() ?? null,
        },
      };
    } catch (err) {
      const code = integrationErrorCode(err);
      const message = integrationErrorMessage(err);
      const row = await prisma.nangoSettings.update({
        data: {
          lastErrorCode: code,
          lastErrorMessage: message,
          lastValidatedAt: new Date(),
        },
        where: { id: GLOBAL_SETTINGS_ID },
      });
      logger.warn(
        { code, durationMs: Date.now() - started, err },
        "Nango settings validation failed",
      );
      return {
        ok: false,
        error: message,
        nango: {
          configured: row.configured,
          host: row.host,
          lastErrorCode: row.lastErrorCode,
          lastErrorMessage: row.lastErrorMessage,
          lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt?.toISOString() ?? null,
        },
      };
    }
  }

  async function saveConnectorOAuthApp({
    clientId,
    clientSecret,
    connectorId,
  }: SaveConnectorOAuthAppInput) {
    const connector = requireConnector(connectorId);
    if (connector.authType !== "nango") {
      throw new IntegrationError({
        code: "validation_error",
        connectorId,
        message: `${connector.displayName} does not use Nango OAuth credentials.`,
      });
    }

    const trimmedClientId = clientId.trim();
    const trimmedSecret = clientSecret.trim();
    if (!trimmedClientId || !trimmedSecret) {
      throw new IntegrationError({
        code: "validation_error",
        connectorId,
        message: "OAuth client ID and client secret are required.",
      });
    }

    const secretRef = connectorSecretAccount(connectorId);
    await keychain.setCredential(secretRef, trimmedSecret);
    const row = await prisma.integrationConnectorSettings.upsert({
      create: {
        connectorId: connector.prismaId,
        nangoIntegrationId: connector.nangoIntegrationId,
        nangoProviderId: connector.nangoProviderId,
        oauthClientId: trimmedClientId,
        oauthClientSecretRef: secretRef,
        redirectUri: NANGO_REDIRECT_URI,
        requiredScopes: connector.requiredScopes,
        setupStatus: "ready",
      },
      update: {
        lastErrorCode: null,
        lastErrorMessage: null,
        nangoIntegrationId: connector.nangoIntegrationId,
        nangoProviderId: connector.nangoProviderId,
        oauthClientId: trimmedClientId,
        oauthClientSecretRef: secretRef,
        redirectUri: NANGO_REDIRECT_URI,
        requiredScopes: connector.requiredScopes,
        setupStatus: "ready",
      },
      where: { connectorId: connector.prismaId },
    });

    const sync = await syncConnectorWithNango(connector).catch(async (err) => {
      const code = integrationErrorCode(err);
      const message = integrationErrorMessage(err);
      await prisma.integrationConnectorSettings.update({
        data: {
          lastErrorCode: code,
          lastErrorMessage: message,
          lastValidatedAt: new Date(),
          setupStatus: "error",
        },
        where: { connectorId: connector.prismaId },
      });
      logger.warn({ code, connectorId, err }, "Nango connector sync failed");
      return { error: message, ok: false };
    });

    return {
      connectorSettings: serializeConnectorSettings(
        await prisma.integrationConnectorSettings.findUniqueOrThrow({
          where: { connectorId: connector.prismaId },
        }),
      ),
      nangoSync: sync,
      saved: true,
      original: serializeConnectorSettings(row),
    };
  }

  async function syncConnectorWithNango(connector: IntegrationConnectorMetadata) {
    if (connector.authType !== "nango") {
      return { ok: true, skipped: true };
    }
    const setting = await prisma.integrationConnectorSettings.findUnique({
      where: { connectorId: connector.prismaId },
    });
    if (!setting?.oauthClientId || !setting.oauthClientSecretRef) {
      throw new IntegrationError({
        code: "settings_invalid",
        connectorId: connector.connectorId,
        message: `${connector.displayName} OAuth app credentials are missing.`,
      });
    }

    const clientSecret = await keychain.getCredential(setting.oauthClientSecretRef);
    const client = await getClient();
    const integrationId = connector.nangoIntegrationId;
    if (!integrationId || !connector.nangoProviderId) {
      throw new IntegrationError({
        code: "settings_invalid",
        connectorId: connector.connectorId,
        message: `${connector.displayName} Nango provider ID is missing.`,
      });
    }

    const credentials = {
      client_id: setting.oauthClientId,
      client_secret: clientSecret,
      scopes: connectorScopesString(connector),
      type: "OAUTH2" as const,
    };
    const createBody = {
      credentials,
      display_name: `Handle Dev - ${connector.displayName}`,
      provider: connector.nangoProviderId,
      unique_key: integrationId,
    };
    const updateBody = {
      credentials: {
        ...credentials,
      },
      display_name: `Handle Dev - ${connector.displayName}`,
    };

    try {
      await client.getIntegration({ uniqueKey: integrationId });
      await client.updateIntegration({ uniqueKey: integrationId }, updateBody);
    } catch (err) {
      if (errorStatus(err) !== 404) throw err;
      await client.createIntegration(createBody);
    }

    await prisma.integrationConnectorSettings.update({
      data: {
        lastErrorCode: null,
        lastErrorMessage: null,
        lastValidatedAt: new Date(),
        setupStatus: "ready",
      },
      where: { connectorId: connector.prismaId },
    });

    return { ok: true };
  }

  async function createConnectSession({
    accountAlias,
    connectorId,
    userId,
  }: ConnectSessionInput) {
    const connector = requireConnector(connectorId);
    if (connector.authType !== "nango") {
      throw new IntegrationError({
        code: "validation_error",
        connectorId,
        message: `${connector.displayName} uses local vault setup, not Nango Connect.`,
      });
    }
    const alias = accountAlias?.trim() || "default";
    let session: Awaited<ReturnType<NangoClient["createConnectSession"]>>;
    try {
      await syncConnectorWithNango(connector);
      const client = await getClient();
      session = await client.createConnectSession({
        allowed_integrations: [connector.nangoIntegrationId ?? connectorId],
        tags: {
          end_user_id: userId,
          handle_account_alias: alias,
          handle_connector_id: connectorId,
          handle_user_id: userId,
        },
      });
    } catch (err) {
      const diagnostic = nangoErrorDiagnostic(err);
      logger.warn(
        {
          connectorId,
          nangoPhase: "create_connect_session",
          nangoStatus: diagnostic.status,
          nangoResponse: diagnostic.response,
        },
        "Nango Connect session creation failed",
      );
      throw new IntegrationError({
        code: integrationErrorCode(err),
        connectorId,
        message: `Nango rejected ${connector.displayName} Connect session: ${diagnostic.message}`,
        ...(diagnostic.status !== null ? { status: diagnostic.status } : {}),
      });
    }

    await prisma.integrationConnectorSettings.update({
      data: {
        setupStatus: "ready",
      },
      where: { connectorId: connector.prismaId },
    });

    return {
      accountAlias: alias,
      connectorId,
      connectLink: session.data.connect_link,
      expiresAt: session.data.expires_at,
      token: session.data.token,
    };
  }

  async function completeConnection({
    accountAlias,
    accountLabel,
    connectionId,
    connectorId,
    userId,
  }: CompleteConnectionInput) {
    const connector = requireConnector(connectorId);
    if (connector.authType !== "nango") {
      throw new IntegrationError({
        code: "validation_error",
        connectorId,
        message: `${connector.displayName} uses local vault setup, not Nango Connect.`,
      });
    }

    const resolved = connectionId
      ? { connectionId, label: accountLabel ?? connectionId }
      : await findLatestConnectionForUser(userId, connector);

    const alias = accountAlias?.trim() || sanitizeAlias(resolved.label || connectorId);
    const existingDefaults = await prisma.integration.count({
      where: { connectorId: connector.prismaId, defaultAccount: true, userId },
    });
    const row = await prisma.integration.upsert({
      create: {
        accountAlias: alias,
        accountLabel: accountLabel ?? resolved.label ?? alias,
        connectorId: connector.prismaId,
        defaultAccount: existingDefaults === 0,
        memoryScope: "NONE",
        nangoConnectionId: resolved.connectionId,
        nangoIntegrationId: connector.nangoIntegrationId,
        scopes: connector.requiredScopes,
        status: "CONNECTED",
        userId,
      },
      update: {
        accountLabel: accountLabel ?? resolved.label ?? alias,
        lastErrorCode: null,
        lastErrorMessage: null,
        nangoConnectionId: resolved.connectionId,
        nangoIntegrationId: connector.nangoIntegrationId,
        scopes: connector.requiredScopes,
        status: "CONNECTED",
      },
      where: {
        userId_connectorId_accountAlias: {
          accountAlias: alias,
          connectorId: connector.prismaId,
          userId,
        },
      },
    });

    return { integration: serializeConnection(row) };
  }

  async function saveLocalVault({
    accountAlias,
    memoryScope,
    userId,
    vaultPath,
  }: SaveLocalVaultInput) {
    const connector = requireConnector("obsidian");
    const trimmedPath = vaultPath.trim();
    if (!trimmedPath) {
      throw new IntegrationError({
        code: "validation_error",
        connectorId: "obsidian",
        message: "Obsidian vault path is required.",
      });
    }

    const stats = await stat(trimmedPath).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new IntegrationError({
        code: "validation_error",
        connectorId: "obsidian",
        message: "Obsidian vault path must be an existing directory.",
      });
    }

    const resolvedVaultPath = await realpath(trimmedPath);
    const alias = sanitizeAlias(accountAlias?.trim() || "default");
    const existingDefaults = await prisma.integration.count({
      where: { connectorId: connector.prismaId, defaultAccount: true, userId },
    });
    const row = await prisma.integration.upsert({
      create: {
        accountAlias: alias,
        accountLabel: alias,
        connectorId: connector.prismaId,
        defaultAccount: existingDefaults === 0,
        memoryScope: memoryScope ?? "NONE",
        metadata: { vaultPath: resolvedVaultPath },
        scopes: [],
        status: "CONNECTED",
        userId,
      },
      update: {
        accountLabel: alias,
        lastErrorCode: null,
        lastErrorMessage: null,
        ...(memoryScope ? { memoryScope } : {}),
        metadata: { vaultPath: resolvedVaultPath },
        status: "CONNECTED",
      },
      where: {
        userId_connectorId_accountAlias: {
          accountAlias: alias,
          connectorId: connector.prismaId,
          userId,
        },
      },
    });

    return { integration: serializeConnection(row) };
  }

  async function testIntegration(integrationId: string, userId: string) {
    const row = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!row) {
      throw new IntegrationError({
        code: "not_connected",
        message: "Integration account not found.",
      });
    }
    const connector = connectorByPrismaId(row.connectorId);
    if (!connector) {
      throw new IntegrationError({
        code: "provider_not_found",
        message: "Integration connector metadata not found.",
      });
    }
    if (!row.nangoConnectionId || !row.nangoIntegrationId) {
      if (connector.connectorId === "obsidian") {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        const vaultPath =
          typeof metadata.vaultPath === "string" ? metadata.vaultPath : null;
        if (!vaultPath) {
          throw new IntegrationError({
            code: "not_connected",
            connectorId: connector.connectorId,
            message: "Obsidian vault path is not configured.",
          });
        }
        const pathStats = await stat(vaultPath).catch(() => null);
        const ok = Boolean(pathStats?.isDirectory());
        const updated = await prisma.integration.update({
          data: {
            lastErrorCode: ok ? null : "not_connected",
            lastErrorMessage: ok ? null : "Obsidian vault path is not reachable.",
            lastHealthCheckAt: new Date(),
            status: ok ? "CONNECTED" : "ERROR",
          },
          where: { id: row.id },
        });
        return {
          ...(ok
            ? { profilePreview: { vaultPath } }
            : { error: "Obsidian vault path is not reachable." }),
          integration: serializeConnection(updated),
          ok,
        };
      }
      throw new IntegrationError({
        code: "not_connected",
        connectorId: connector.connectorId,
        message: `${connector.displayName} account is missing Nango connection metadata.`,
      });
    }

    const client = await getClient();
    try {
      const profile =
        connector.connectorId === "github"
          ? await client
              .get({
                connectionId: row.nangoConnectionId,
                endpoint: "/user",
                providerConfigKey: row.nangoIntegrationId,
              })
              .then((response) => response.data as Record<string, unknown>)
          : await client.getConnection(row.nangoIntegrationId, row.nangoConnectionId);
      const updated = await prisma.integration.update({
        data: {
          lastErrorCode: null,
          lastErrorMessage: null,
          lastHealthCheckAt: new Date(),
          status: "CONNECTED",
        },
        where: { id: row.id },
      });
      return {
        integration: serializeConnection(updated),
        ok: true,
        profilePreview: previewProfile(profile),
      };
    } catch (err) {
      const code = integrationErrorCode(err);
      const message = integrationErrorMessage(err);
      const updated = await prisma.integration.update({
        data: {
          lastErrorCode: code,
          lastErrorMessage: message,
          lastHealthCheckAt: new Date(),
          status: statusFromErrorCode(code),
        },
        where: { id: row.id },
      });
      return {
        error: message,
        integration: serializeConnection(updated),
        ok: false,
      };
    }
  }

  async function resolveConnectedIntegration({
    accountAlias,
    connectorId,
    userId,
  }: {
    accountAlias?: string;
    connectorId: IntegrationConnectorId;
    userId: string;
  }) {
    const connector = requireConnector(connectorId);
    if (connector.authType !== "nango") {
      throw new IntegrationError({
        code: "provider_not_found",
        connectorId,
        message: `${connector.displayName} is not a Nango integration.`,
      });
    }

    const baseWhere = {
      connectorId: connector.prismaId,
      userId,
    };
    const requestedAlias = accountAlias?.trim();
    const row = requestedAlias
      ? await prisma.integration.findFirst({
          where: { ...baseWhere, accountAlias: requestedAlias },
        })
      : await prisma.integration.findFirst({
          orderBy: [{ defaultAccount: "desc" }, { accountAlias: "asc" }],
          where: { ...baseWhere, status: { in: ["CONNECTED", "ERROR"] } },
        });

    if (!row) {
      const available = await prisma.integration.findMany({
        orderBy: [{ defaultAccount: "desc" }, { accountAlias: "asc" }],
        select: { accountAlias: true, status: true },
        where: baseWhere,
      });
      const accountList = available
        .map((account) => `${account.accountAlias} (${account.status})`)
        .join(", ");
      throw new IntegrationError({
        code: available.length > 1 ? "account_selection_required" : "not_connected",
        connectorId,
        message: available.length
          ? `${connector.displayName} account ${
              requestedAlias ? requestedAlias : "default"
            } is not connected. Available accounts: ${accountList}.`
          : `${connector.displayName} is not connected. Connect it in Settings -> Integrations.`,
      });
    }

    if (row.status !== "CONNECTED" && row.status !== "ERROR") {
      throw new IntegrationError({
        code: statusToIntegrationErrorCode(row.status),
        connectorId,
        message: `${connector.displayName} account ${row.accountAlias} is ${row.status.toLowerCase()}. Reconnect it in Settings -> Integrations.`,
      });
    }
    if (!row.nangoConnectionId || !row.nangoIntegrationId) {
      throw new IntegrationError({
        code: "not_connected",
        connectorId,
        message: `${connector.displayName} account ${row.accountAlias} is missing Nango connection metadata.`,
      });
    }

    return { connector, row };
  }

  async function requestIntegration({
    accountAlias,
    baseUrlOverride,
    connectorId,
    data,
    endpoint,
    method = "GET",
    params,
    userId,
  }: IntegrationRequestInput) {
    const started = Date.now();
    const { connector, row } = await resolveConnectedIntegration({
      ...(accountAlias ? { accountAlias } : {}),
      connectorId,
      userId,
    });
    const client = await getClient();
    const methodName = method.toLowerCase();
    const requester = (client as unknown as Record<string, (args: unknown) => Promise<unknown>>)[
      methodName
    ];
    if (typeof requester !== "function") {
      throw new IntegrationError({
        code: "validation_error",
        connectorId,
        message: `Nango client does not support ${method} requests.`,
      });
    }

    try {
      const response = await requester.call(client, {
        connectionId: row.nangoConnectionId,
        endpoint,
        providerConfigKey: row.nangoIntegrationId,
        ...(baseUrlOverride ?? connectorBaseUrlOverride(connectorId)
          ? { baseUrlOverride: baseUrlOverride ?? connectorBaseUrlOverride(connectorId) }
          : {}),
        ...(params ? { params } : {}),
        ...(data !== undefined ? { data } : {}),
      });
      const payload = responseDataPayload(response);
      assertProviderPayloadSuccess(connectorId, payload);
      await prisma.integration.update({
        data: {
          lastErrorCode: null,
          lastErrorMessage: null,
          lastUsedAt: new Date(),
          status: "CONNECTED",
        },
        where: { id: row.id },
      });
      logger.info(
        {
          accountAlias: row.accountAlias,
          connectorId,
          durationMs: Date.now() - started,
          endpoint,
          method,
        },
        "Integration provider request succeeded",
      );
      return {
        accountAlias: row.accountAlias,
        connectorId,
        data: payload,
        endpoint,
        method,
      };
    } catch (err) {
      const code = integrationErrorCode(err);
      const message = integrationErrorMessage(err);
      await prisma.integration.update({
        data: {
          lastErrorCode: code,
          lastErrorMessage: message,
          status: statusFromErrorCode(code),
        },
        where: { id: row.id },
      });
      logger.warn(
        {
          accountAlias: row.accountAlias,
          code,
          connectorId,
          durationMs: Date.now() - started,
          endpoint,
          err,
          method,
        },
        "Integration provider request failed",
      );
      const status = errorStatus(err);
      throw new IntegrationError({
        code,
        connectorId,
        message,
        ...(typeof status === "number" ? { status } : {}),
      });
    }
  }

  function connectorBaseUrlOverride(connectorId: IntegrationConnectorId) {
    if (connectorId === "slack") return "https://slack.com";
    return null;
  }

  function assertProviderPayloadSuccess(connectorId: IntegrationConnectorId, payload: unknown) {
    if (connectorId !== "slack" || !payload || typeof payload !== "object") return;
    const body = payload as Record<string, unknown>;
    if (body.ok !== false) return;
    const providerError = typeof body.error === "string" ? body.error : "unknown_error";
    throw new IntegrationError({
      code: providerError === "not_in_channel" ? "validation_error" : "unknown_provider_error",
      connectorId,
      message: `Slack returned ${providerError}.`,
    });
  }

  async function deleteIntegration(integrationId: string, userId: string) {
    const row = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!row) return { deleted: true };
    if (row.nangoIntegrationId && row.nangoConnectionId) {
      const client = await getClient().catch(() => null);
      if (client) {
        await client
          .deleteConnection(row.nangoIntegrationId, row.nangoConnectionId)
          .catch((err) => {
            logger.warn(
              { err, integrationId },
              "Nango connection delete failed; deleting local row",
            );
          });
      }
    }
    await prisma.integration.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  async function updateIntegration({
    accountAlias,
    accountLabel,
    defaultAccount,
    integrationId,
    memoryScope,
    userId,
  }: UpdateIntegrationInput) {
    const row = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!row) {
      throw new IntegrationError({
        code: "not_connected",
        message: "Integration account not found.",
      });
    }

    if (defaultAccount === true) {
      await prisma.integration.updateMany({
        data: { defaultAccount: false },
        where: {
          connectorId: row.connectorId,
          id: { not: row.id },
          userId,
        },
      });
    }

    const updated = await prisma.integration.update({
      data: {
        ...(accountAlias?.trim() ? { accountAlias: sanitizeAlias(accountAlias) } : {}),
        ...(accountLabel !== undefined ? { accountLabel } : {}),
        ...(defaultAccount !== undefined ? { defaultAccount } : {}),
        ...(memoryScope ? { memoryScope } : {}),
      },
      where: { id: row.id },
    });

    return { integration: serializeConnection(updated) };
  }

  async function findLatestConnectionForUser(
    userId: string,
    connector: IntegrationConnectorMetadata,
  ) {
    const client = await getClient();
    const baseParams = {
      limit: 20,
      ...(connector.nangoIntegrationId
        ? { integrationId: connector.nangoIntegrationId }
        : {}),
    };
    const taggedParams = {
      ...baseParams,
      tags: {
        end_user_id: userId,
        handle_connector_id: connector.connectorId,
      },
    };

    const tagged = await listConnectionsForLookup(client, connector, taggedParams, {
      lookupMode: "tags",
      tagKeys: Object.keys(taggedParams.tags),
    });
    if (tagged[0]) {
      return connectionResult(tagged[0]);
    }

    const legacyParams = { ...baseParams, userId };
    const legacy = await listConnectionsForLookup(client, connector, legacyParams, {
      lookupMode: "legacy_user_id",
    });
    if (legacy[0]) {
      return connectionResult(legacy[0]);
    }

    const byIntegration = await listConnectionsForLookup(client, connector, baseParams, {
      lookupMode: "integration_only",
    });
    if (byIntegration.length === 1 && byIntegration[0]) {
      return connectionResult(byIntegration[0]);
    }

    if (byIntegration.length > 1) {
      throw new IntegrationError({
        code: "not_connected",
        connectorId: connector.connectorId,
        message: `Found ${byIntegration.length} ${connector.displayName} Nango connections. Paste the desired connection ID in Settings -> Integrations, then click Finish ${connector.displayName} connection.`,
      });
    }

    throw new IntegrationError({
      code: "not_connected",
      connectorId: connector.connectorId,
      message: `No ${connector.displayName} Nango connection found for this user yet.`,
    });
  }

  async function listConnectionsForLookup(
    client: NangoClient,
    connector: IntegrationConnectorMetadata,
    params: Record<string, unknown>,
    details: Record<string, unknown>,
  ) {
    const response = await client.listConnections(params);
    const connections = normalizeConnections(response);
    logger.info(
      {
        connectorId: connector.connectorId,
        count: connections.length,
        nangoIntegrationId: connector.nangoIntegrationId,
        nangoPhase: "find_latest_connection",
        ...details,
      },
      "Nango connection lookup completed",
    );
    return connections;
  }

  function connectionResult(latest: Record<string, unknown>) {
    return {
      connectionId: connectionIdOf(latest),
      label: connectionLabelOf(latest),
    };
  }

  return {
    completeConnection,
    createConnectSession,
    deleteIntegration,
    ensureConnectorSettings,
    listSettings,
    requestIntegration,
    resolveConnectedIntegration,
    saveLocalVault,
    saveConnectorOAuthApp,
    saveNangoSecret,
    syncConnectorWithNango,
    testIntegration,
    updateIntegration,
    validateNangoSecret,
  };
}

function requireConnector(connectorId: IntegrationConnectorId) {
  const connector = connectorById(connectorId);
  if (!connector) {
    throw new IntegrationError({
      code: "provider_not_found",
      connectorId,
      message: `Unknown integration connector: ${connectorId}`,
    });
  }
  return connector;
}

function serializeConnector(connector: IntegrationConnectorMetadata) {
  return {
    authType: connector.authType,
    connectorId: connector.connectorId,
    description: connector.description,
    displayName: connector.displayName,
    ...(connector.docsUrl ? { docsUrl: connector.docsUrl } : {}),
    nangoProviderId: connector.nangoProviderId,
    ...(connector.oauthAppUrl ? { oauthAppUrl: connector.oauthAppUrl } : {}),
    requiredScopes: connector.requiredScopes,
    setupGuide: connector.setupGuide,
    tier: connector.tier,
  };
}

function serializeConnectorSettings(row: {
  connectorId: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastValidatedAt: Date | null;
  nangoIntegrationId: string | null;
  nangoProviderId: string | null;
  oauthClientId: string | null;
  redirectUri: string | null;
  requiredScopes: unknown;
  setupStatus: string;
  updatedAt: Date | null;
}) {
  const connector = connectorByPrismaId(row.connectorId as never);
  return {
    clientIdConfigured: Boolean(row.oauthClientId),
    connectorId: connector?.connectorId ?? "github",
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    nangoIntegrationId: row.nangoIntegrationId,
    nangoProviderId: row.nangoProviderId,
    redirectUri: row.redirectUri,
    requiredScopes: arrayOfStrings(row.requiredScopes),
    setupStatus: row.setupStatus as never,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function serializeConnection(row: {
  accountAlias: string;
  accountLabel: string | null;
  connectorId: string;
  createdAt: Date | null;
  defaultAccount: boolean;
  id: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHealthCheckAt: Date | null;
  lastUsedAt: Date | null;
  memoryScope: string;
  metadata?: unknown;
  nangoConnectionId: string | null;
  nangoIntegrationId: string | null;
  status: string;
  updatedAt: Date | null;
}) {
  const connector = connectorByPrismaId(row.connectorId as never);
  return {
    accountAlias: row.accountAlias,
    accountLabel: row.accountLabel,
    connectorId: connector?.connectorId ?? "github",
    createdAt: row.createdAt?.toISOString() ?? null,
    defaultAccount: row.defaultAccount,
    id: row.id,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    memoryScope: row.memoryScope as MemoryScope,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    nangoConnectionId: row.nangoConnectionId,
    nangoIntegrationId: row.nangoIntegrationId,
    status: row.status as IntegrationConnectionStatus,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeConnections(response: unknown): Record<string, unknown>[] {
  if (Array.isArray(response)) return response as Record<string, unknown>[];
  if (response && typeof response === "object") {
    const maybe = response as Record<string, unknown>;
    if (Array.isArray(maybe.connections)) {
      return maybe.connections as Record<string, unknown>[];
    }
    if (Array.isArray(maybe.data)) {
      return maybe.data as Record<string, unknown>[];
    }
  }
  return [];
}

function connectionIdOf(connection: Record<string, unknown>) {
  const id =
    connection.connection_id ??
    connection.connectionId ??
    connection.id ??
    connection.connectionId;
  if (typeof id !== "string" || !id) {
    throw new IntegrationError({
      code: "not_connected",
      message: "Nango connection did not include a connection ID.",
    });
  }
  return id;
}

function connectionLabelOf(connection: Record<string, unknown>) {
  const profile =
    typeof connection.end_user === "object" && connection.end_user !== null
      ? (connection.end_user as Record<string, unknown>)
      : {};
  const label =
    connection.email ??
    connection.accountLabel ??
    connection.connection_id ??
    profile.email ??
    profile.display_name;
  return typeof label === "string" ? label : null;
}

function sanitizeAlias(label: string) {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "default";
}

function statusFromErrorCode(code: string) {
  if (code === "auth_expired") return "EXPIRED";
  if (code === "auth_revoked") return "REVOKED";
  if (code === "rate_limited") return "RATE_LIMITED";
  return "ERROR";
}

function statusToIntegrationErrorCode(status: string): IntegrationError["code"] {
  if (status === "EXPIRED") return "auth_expired";
  if (status === "REVOKED") return "auth_revoked";
  if (status === "RATE_LIMITED") return "rate_limited";
  return "not_connected";
}

function responseDataPayload(response: unknown) {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: unknown }).data;
  }
  return response;
}

function nangoErrorDiagnostic(err: unknown) {
  const status = errorStatus(err);
  const response = responseData(err);
  const message = responseMessage(response) ?? integrationErrorMessage(err);
  return {
    message,
    response: redactedJson(response),
    status,
  };
}

function responseData(err: unknown) {
  if (typeof err !== "object" || err === null) return null;
  if (
    "response" in err &&
    typeof err.response === "object" &&
    err.response !== null &&
    "data" in err.response
  ) {
    return err.response.data;
  }
  return null;
}

function responseMessage(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (typeof response !== "object" || response === null) return null;

  const record = response as Record<string, unknown>;
  const nestedError =
    typeof record.error === "object" && record.error !== null
      ? (record.error as Record<string, unknown>)
      : null;
  const candidates = [
    record.message,
    record.error,
    nestedError?.message,
    nestedError ? nestedErrorMessages(nestedError) : null,
    typeof record.errors === "string" ? record.errors : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function nestedErrorMessages(error: Record<string, unknown>) {
  const errors = error.errors;
  if (!Array.isArray(errors)) return null;
  const messages = errors
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        const message = (item as Record<string, unknown>).message;
        return typeof message === "string" ? message : null;
      }
      return null;
    })
    .filter((message): message is string => Boolean(message));
  if (messages.length === 0) return null;
  const code = typeof error.code === "string" ? `${error.code}: ` : "";
  return `${code}${messages.join("; ")}`;
}

function redactedJson(value: unknown) {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_key, current) => {
    if (typeof current === "string") return integrationErrorMessage(current);
    return current;
  }));
}

function previewProfile(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  const record = profile as Record<string, unknown>;
  return {
    email: typeof record.email === "string" ? record.email : undefined,
    id: typeof record.id === "number" || typeof record.id === "string" ? record.id : undefined,
    login: typeof record.login === "string" ? record.login : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
  };
}

function isUniqueConstraintError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "P2002"
  );
}
