import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NANGO_SECRET_KEY_ACCOUNT, createNangoService } from "./nangoService";

describe("Nango service", () => {
  it("updates existing integration credentials without resending provider and creates a tagged Connect session", async () => {
    const client = {
      createConnectSession: vi.fn().mockResolvedValue({
        data: {
          connect_link: "https://connect.nango.dev/session-test",
          expires_at: "2026-05-04T02:51:18.336Z",
          token: "connect-token-test",
        },
      }),
      createIntegration: vi.fn(),
      getIntegration: vi.fn().mockResolvedValue({
        data: { unique_key: "handle-dev-github" },
      }),
      updateIntegration: vi.fn().mockResolvedValue({
        data: { unique_key: "handle-dev-github" },
      }),
    };
    const prisma = {
      integrationConnectorSettings: {
        findUnique: vi.fn().mockResolvedValue({
          oauthClientId: "github-client-id-not-real",
          oauthClientSecretRef: "github-secret-ref",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      nangoSettings: {
        upsert: vi.fn().mockResolvedValue({
          configured: true,
          host: "https://api.nango.dev",
          secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
        }),
      },
    } as unknown as PrismaClient;
    const keychain = {
      deleteCredential: vi.fn(),
      getCredential: vi.fn(async (account: string) =>
        account === "github-secret-ref"
          ? "github-client-secret-not-real"
          : "nango-secret-key-not-real",
      ),
      setCredential: vi.fn(),
    };
    const service = createNangoService({
      keychain,
      nangoClientFactory: () => client as never,
      prisma,
    });

    const result = await service.createConnectSession({
      accountAlias: "default",
      connectorId: "github",
      userId: "user-test",
    });

    expect(result.connectLink).toBe("https://connect.nango.dev/session-test");
    expect(client.updateIntegration).toHaveBeenCalledWith(
      { uniqueKey: "handle-dev-github" },
      expect.not.objectContaining({ provider: expect.anything() }),
    );
    expect(client.createConnectSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ end_user: expect.anything() }),
    );
    expect(client.createConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_integrations: ["handle-dev-github"],
        tags: expect.objectContaining({
          end_user_id: "user-test",
          handle_account_alias: "default",
          handle_connector_id: "github",
          handle_user_id: "user-test",
        }),
      }),
    );
  });

  it("creates API-token integrations without requiring OAuth client credentials", async () => {
    const client = {
      createConnectSession: vi.fn().mockResolvedValue({
        data: {
          connect_link: "https://connect.nango.dev/session-vercel",
          expires_at: "2026-05-04T02:51:18.336Z",
          token: "connect-token-test",
        },
      }),
      createIntegration: vi.fn().mockResolvedValue({
        data: { unique_key: "handle-dev-vercel" },
      }),
      getIntegration: vi.fn().mockRejectedValue({ status: 404 }),
      updateIntegration: vi.fn(),
    };
    const prisma = {
      integrationConnectorSettings: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      nangoSettings: {
        upsert: vi.fn().mockResolvedValue({
          configured: true,
          host: "https://api.nango.dev",
          secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
        }),
      },
    } as unknown as PrismaClient;
    const keychain = {
      deleteCredential: vi.fn(),
      getCredential: vi.fn().mockResolvedValue("nango-secret-key-not-real"),
      setCredential: vi.fn(),
    };
    const service = createNangoService({
      keychain,
      nangoClientFactory: () => client as never,
      prisma,
    });

    const result = await service.createConnectSession({
      accountAlias: "default",
      connectorId: "vercel",
      userId: "user-test",
    });

    expect(result.connectLink).toBe("https://connect.nango.dev/session-vercel");
    expect(prisma.integrationConnectorSettings.findUnique).not.toHaveBeenCalled();
    expect(client.createIntegration).toHaveBeenCalledWith(
      expect.not.objectContaining({ credentials: expect.anything() }),
    );
    expect(client.createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "Handle Dev - Vercel",
        provider: "vercel",
        unique_key: "handle-dev-vercel",
      }),
    );
    expect(client.createConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_integrations: ["handle-dev-vercel"],
      }),
    );
  });

  it("rejects OAuth app saves for API-token connectors", async () => {
    const service = createNangoService({
      keychain: {
        deleteCredential: vi.fn(),
        getCredential: vi.fn(),
        setCredential: vi.fn(),
      },
      nangoClientFactory: () => ({}) as never,
      prisma: {} as PrismaClient,
    });

    await expect(
      service.saveConnectorOAuthApp({
        clientId: "vercel-client-id-not-real",
        clientSecret: "vercel-client-secret-not-real",
        connectorId: "vercel",
      }),
    ).rejects.toThrow(
      "Vercel uses API-token setup through Nango Connect, not OAuth client credentials.",
    );
  });

  it("finds completed connections using the same tags written to the Connect session", async () => {
    const client = {
      listConnections: vi.fn().mockResolvedValue({
        data: [{ connection_id: "conn-github" }],
      }),
    };
    const prisma = {
      integration: {
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({
          accountAlias: "default",
          accountLabel: "conn-github",
          connectorId: "GITHUB",
          createdAt: new Date("2026-05-04T02:00:00.000Z"),
          defaultAccount: true,
          id: "integration-github",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastHealthCheckAt: null,
          lastUsedAt: null,
          memoryScope: "NONE",
          nangoConnectionId: "conn-github",
          nangoIntegrationId: "handle-dev-github",
          status: "CONNECTED",
          updatedAt: new Date("2026-05-04T02:00:00.000Z"),
        }),
      },
      nangoSettings: {
        upsert: vi.fn().mockResolvedValue({
          configured: true,
          host: "https://api.nango.dev",
          secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
        }),
      },
    } as unknown as PrismaClient;
    const service = createNangoService({
      keychain: {
        deleteCredential: vi.fn(),
        getCredential: vi.fn().mockResolvedValue("nango-secret-key-not-real"),
        setCredential: vi.fn(),
      },
      nangoClientFactory: () => client as never,
      prisma,
    });

    const result = await service.completeConnection({
      accountAlias: "default",
      connectorId: "github",
      userId: "user-test",
    });

    expect(result.integration.status).toBe("CONNECTED");
    expect(client.listConnections).toHaveBeenCalledWith({
      integrationId: "handle-dev-github",
      limit: 20,
      tags: {
        end_user_id: "user-test",
        handle_connector_id: "github",
      },
    });
    expect(client.listConnections).toHaveBeenCalledTimes(1);
  });

  it("safely imports the only connector connection when Nango did not retain tags", async () => {
    const client = {
      listConnections: vi
        .fn()
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ connection_id: "conn-github-fallback" }],
        }),
    };
    const prisma = {
      integration: {
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({
          accountAlias: "default",
          accountLabel: "conn-github-fallback",
          connectorId: "GITHUB",
          createdAt: new Date("2026-05-04T02:00:00.000Z"),
          defaultAccount: true,
          id: "integration-github",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastHealthCheckAt: null,
          lastUsedAt: null,
          memoryScope: "NONE",
          nangoConnectionId: "conn-github-fallback",
          nangoIntegrationId: "handle-dev-github",
          status: "CONNECTED",
          updatedAt: new Date("2026-05-04T02:00:00.000Z"),
        }),
      },
      nangoSettings: {
        upsert: vi.fn().mockResolvedValue({
          configured: true,
          host: "https://api.nango.dev",
          secretKeyRef: NANGO_SECRET_KEY_ACCOUNT,
        }),
      },
    } as unknown as PrismaClient;
    const service = createNangoService({
      keychain: {
        deleteCredential: vi.fn(),
        getCredential: vi.fn().mockResolvedValue("nango-secret-key-not-real"),
        setCredential: vi.fn(),
      },
      nangoClientFactory: () => client as never,
      prisma,
    });

    const result = await service.completeConnection({
      accountAlias: "default",
      connectorId: "github",
      userId: "user-test",
    });

    expect(result.integration.status).toBe("CONNECTED");
    expect(result.integration.nangoConnectionId).toBe("conn-github-fallback");
    expect(client.listConnections).toHaveBeenNthCalledWith(1, {
      integrationId: "handle-dev-github",
      limit: 20,
      tags: {
        end_user_id: "user-test",
        handle_connector_id: "github",
      },
    });
    expect(client.listConnections).toHaveBeenNthCalledWith(2, {
      integrationId: "handle-dev-github",
      limit: 20,
      userId: "user-test",
    });
    expect(client.listConnections).toHaveBeenNthCalledWith(3, {
      integrationId: "handle-dev-github",
      limit: 20,
    });
  });
});
