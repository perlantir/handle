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
});
