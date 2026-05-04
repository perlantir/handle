import type { IntegrationSettingsResponse } from "@handle/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createIntegrationsRouter } from "./integrations";

const settingsFixture: IntegrationSettingsResponse = {
  connections: [],
  connectorSettings: [
    {
      clientIdConfigured: true,
      connectorId: "github",
      lastErrorCode: null,
      lastErrorMessage: null,
      lastValidatedAt: null,
      nangoIntegrationId: "handle-dev-github",
      nangoProviderId: "github",
      redirectUri: "https://api.nango.dev/oauth/callback",
      requiredScopes: ["read:user", "user:email", "repo"],
      setupStatus: "ready",
      updatedAt: null,
    },
  ],
  connectors: [
    {
      authType: "nango",
      connectorId: "github",
      description: "Read and act on GitHub repositories, issues, and pull requests.",
      displayName: "GitHub",
      nangoProviderId: "github",
      requiredScopes: ["read:user", "user:email", "repo"],
      setupGuide: [],
      tier: 1,
    },
  ],
  nango: {
    configured: true,
    host: "https://api.nango.dev",
    lastErrorCode: null,
    lastErrorMessage: null,
    lastValidatedAt: null,
    updatedAt: null,
  },
};

function createApp() {
  const nangoService = {
    completeConnection: vi.fn().mockResolvedValue({
      integration: {
        accountAlias: "default",
        connectorId: "github",
        defaultAccount: true,
        id: "integration-test",
        memoryScope: "NONE",
        status: "CONNECTED",
      },
    }),
    createConnectSession: vi.fn().mockResolvedValue({
      accountAlias: "default",
      connectorId: "github",
      connectLink: "https://connect.nango.dev/session-test",
      expiresAt: "2026-05-03T12:00:00.000Z",
      token: "connect-token-test",
    }),
    deleteIntegration: vi.fn().mockResolvedValue({ deleted: true }),
    listSettings: vi.fn().mockResolvedValue(settingsFixture),
    testIntegration: vi.fn().mockResolvedValue({
      integration: {
        accountAlias: "default",
        connectorId: "github",
        defaultAccount: true,
        id: "integration-test",
        memoryScope: "NONE",
        status: "CONNECTED",
      },
      ok: true,
      profilePreview: { login: "perlantir" },
    }),
    updateIntegration: vi.fn().mockResolvedValue({
      integration: {
        accountAlias: "primary",
        connectorId: "github",
        defaultAccount: true,
        id: "integration-test",
        memoryScope: "PROJECT_ONLY",
        status: "CONNECTED",
      },
    }),
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createIntegrationsRouter({
      getUserId: () => "user-test",
      nangoService,
    }),
  );
  return { app, nangoService };
}

describe("integrations routes", () => {
  it("creates a GitHub Nango Connect session", async () => {
    const { app, nangoService } = createApp();

    const response = await request(app)
      .post("/api/integrations/github/connect-session")
      .send({ accountAlias: "default" })
      .expect(200);

    expect(response.body.connectLink).toBe("https://connect.nango.dev/session-test");
    expect(nangoService.createConnectSession).toHaveBeenCalledWith({
      accountAlias: "default",
      connectorId: "github",
      userId: "user-test",
    });
  });

  it("completes, tests, updates, and deletes an integration account", async () => {
    const { app, nangoService } = createApp();

    await request(app)
      .post("/api/integrations/github/complete")
      .send({ accountAlias: "default", connectionId: "conn-test" })
      .expect(200);
    expect(nangoService.completeConnection).toHaveBeenCalledWith({
      accountAlias: "default",
      connectionId: "conn-test",
      connectorId: "github",
      userId: "user-test",
    });

    await request(app).post("/api/integrations/integration-test/test").expect(200);
    expect(nangoService.testIntegration).toHaveBeenCalledWith(
      "integration-test",
      "user-test",
    );

    await request(app)
      .put("/api/integrations/integration-test")
      .send({ accountAlias: "primary", memoryScope: "PROJECT_ONLY" })
      .expect(200);
    expect(nangoService.updateIntegration).toHaveBeenCalledWith({
      accountAlias: "primary",
      integrationId: "integration-test",
      memoryScope: "PROJECT_ONLY",
      userId: "user-test",
    });

    await request(app).delete("/api/integrations/integration-test").expect(200);
    expect(nangoService.deleteIntegration).toHaveBeenCalledWith(
      "integration-test",
      "user-test",
    );
  });

  it("rejects unknown connectors", async () => {
    const { app } = createApp();

    await request(app)
      .post("/api/integrations/nope/connect-session")
      .send({ accountAlias: "default" })
      .expect(404);
  });
});
