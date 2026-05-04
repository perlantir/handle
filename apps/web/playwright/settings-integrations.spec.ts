import { expect, test, type Page, type Route } from "@playwright/test";
import type { IntegrationSettingsResponse } from "@handle/shared";

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

function integrationFixture(): IntegrationSettingsResponse {
  return {
    connections: [],
    connectorSettings: [
      {
        clientIdConfigured: false,
        connectorId: "github",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastValidatedAt: null,
        nangoIntegrationId: "handle-dev-github",
        nangoProviderId: "github",
        redirectUri: "https://api.nango.dev/oauth/callback",
        requiredScopes: ["read:user", "user:email", "repo"],
        setupStatus: "missing_credentials",
        updatedAt: null,
      },
      {
        clientIdConfigured: false,
        connectorId: "obsidian",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastValidatedAt: null,
        nangoIntegrationId: null,
        nangoProviderId: null,
        redirectUri: null,
        requiredScopes: [],
        setupStatus: "local_vault",
        updatedAt: null,
      },
      {
        clientIdConfigured: false,
        connectorId: "vercel",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastValidatedAt: null,
        nangoIntegrationId: "handle-dev-vercel",
        nangoProviderId: "vercel",
        redirectUri: null,
        requiredScopes: [],
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
        docsUrl: "https://docs.nango.dev/integrations/all/github",
        nangoProviderId: "github",
        oauthAppUrl: "https://github.com/settings/developers",
        requiredScopes: ["read:user", "user:email", "repo"],
        setupGuide: [
          "Open GitHub Developer Settings.",
          "Create an OAuth app named Handle Dev - GitHub.",
        ],
        tier: 1,
      },
      {
        authType: "local-vault",
        connectorId: "obsidian",
        description: "Read and edit one local Obsidian vault through SafetyGovernor.",
        displayName: "Obsidian",
        nangoProviderId: null,
        requiredScopes: [],
        setupGuide: [
          "Choose one local vault path.",
          "Handle will deny path traversal outside that vault.",
        ],
        tier: 3,
      },
      {
        authType: "nango-api-key",
        connectorId: "vercel",
        description: "Inspect projects and manage deployments.",
        displayName: "Vercel",
        docsUrl: "https://docs.nango.dev/integrations/all/vercel",
        nangoProviderId: "vercel",
        oauthAppUrl: "https://vercel.com/account/tokens",
        requiredScopes: [],
        setupGuide: [
          "Open Vercel Account Settings -> Tokens.",
          "Paste the access token in the Nango Connect window.",
        ],
        tier: 2,
      },
    ],
    nango: {
      configured: false,
      host: "https://api.nango.dev",
      lastErrorCode: null,
      lastErrorMessage: null,
      lastValidatedAt: null,
      updatedAt: null,
    },
  };
}

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function requestBody(route: Route) {
  const text = route.request().postData();
  if (!text) return null;
  return JSON.parse(text);
}

async function mockApi(page: Page) {
  const requests: RecordedRequest[] = [];
  const settings = integrationFixture();

  await page.route("**/api/projects**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/projects") {
      await jsonRoute(route, 200, { projects: [] });
      return;
    }
    await jsonRoute(route, 200, { conversations: [] });
  });

  await page.route("**/api/settings/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = await requestBody(route);
    requests.push({ body, method, path });

    if (method === "GET" && path === "/api/settings/providers") {
      await jsonRoute(route, 200, { providers: [] });
      return;
    }

    if (path === "/api/settings/providers/openai/oauth/status") {
      await jsonRoute(route, 200, {
        providerId: "openai",
        status: {
          accountId: null,
          email: null,
          expires: null,
          flowError: null,
          flowState: null,
          planType: null,
          port: null,
          signedIn: false,
        },
      });
      return;
    }

    if (method === "GET" && path === "/api/settings/integrations") {
      await jsonRoute(route, 200, settings);
      return;
    }

    if (method === "POST" && path === "/api/settings/integrations/nango") {
      settings.nango.configured = true;
      settings.nango.lastValidatedAt = "2026-05-03T12:00:00.000Z";
      await jsonRoute(route, 200, {
        nango: settings.nango,
        validation: { ok: true, nango: settings.nango },
      });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/settings/integrations/github/oauth-app"
    ) {
      const githubSettings = settings.connectorSettings.find(
        (item) => item.connectorId === "github",
      );
      if (githubSettings) {
        githubSettings.clientIdConfigured = true;
        githubSettings.setupStatus = "ready";
      }
      await jsonRoute(route, 200, { saved: true });
      return;
    }

    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });

  await page.route("**/api/integrations/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = await requestBody(route);
    requests.push({ body, method, path });

    if (method === "POST" && path === "/api/integrations/github/connect-session") {
      await jsonRoute(route, 200, {
        accountAlias: "default",
        connectorId: "github",
        connectLink: "https://connect.nango.dev/session-test",
        expiresAt: "2026-05-03T12:10:00.000Z",
        token: "connect-token-not-real",
      });
      return;
    }

    if (method === "POST" && path === "/api/integrations/vercel/connect-session") {
      await jsonRoute(route, 200, {
        accountAlias: "default",
        connectorId: "vercel",
        connectLink: "https://connect.nango.dev/session-vercel",
        expiresAt: "2026-05-03T12:10:00.000Z",
        token: "connect-token-not-real",
      });
      return;
    }

    if (method === "POST" && path === "/api/integrations/github/complete") {
      settings.connections = [
        {
          accountAlias: "default",
          accountLabel: "perlantir",
          connectorId: "github",
          createdAt: "2026-05-03T12:00:00.000Z",
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
          updatedAt: "2026-05-03T12:00:00.000Z",
        },
      ];
      await jsonRoute(route, 200, { integration: settings.connections[0] });
      return;
    }

    if (method === "POST" && path === "/api/integrations/vercel/complete") {
      settings.connections = [
        ...settings.connections.filter(
          (connection) => connection.connectorId !== "vercel",
        ),
        {
          accountAlias: "default",
          accountLabel: "Vercel",
          connectorId: "vercel",
          createdAt: "2026-05-03T12:00:00.000Z",
          defaultAccount: true,
          id: "integration-vercel",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastHealthCheckAt: null,
          lastUsedAt: null,
          memoryScope: "NONE",
          nangoConnectionId: "conn-vercel",
          nangoIntegrationId: "handle-dev-vercel",
          status: "CONNECTED",
          updatedAt: "2026-05-03T12:00:00.000Z",
        },
      ];
      await jsonRoute(route, 200, {
        integration: settings.connections.find(
          (connection) => connection.connectorId === "vercel",
        ),
      });
      return;
    }

    if (method === "POST" && path === "/api/integrations/integration-github/test") {
      await jsonRoute(route, 200, {
        integration: settings.connections[0],
        ok: true,
        profilePreview: { login: "perlantir" },
      });
      return;
    }

    if (method === "PUT" && path === "/api/integrations/integration-github") {
      const connection = settings.connections[0];
      if (connection && body && typeof body === "object") {
        Object.assign(connection, body);
      }
      await jsonRoute(route, 200, { integration: connection });
      return;
    }

    if (method === "POST" && path === "/api/integrations/obsidian/local-vault") {
      const vaultPath =
        body && typeof body === "object" && "vaultPath" in body
          ? String(body.vaultPath)
          : "/tmp/handle-vault";
      settings.connections = [
        ...settings.connections.filter(
          (connection) => connection.connectorId !== "obsidian",
        ),
        {
          accountAlias: "default",
          accountLabel: "default",
          connectorId: "obsidian",
          createdAt: "2026-05-03T12:00:00.000Z",
          defaultAccount: true,
          id: "integration-obsidian",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastHealthCheckAt: null,
          lastUsedAt: null,
          memoryScope: "NONE",
          metadata: { vaultPath },
          nangoConnectionId: null,
          nangoIntegrationId: null,
          status: "CONNECTED",
          updatedAt: "2026-05-03T12:00:00.000Z",
        },
      ];
      await jsonRoute(route, 200, {
        integration: settings.connections.find(
          (connection) => connection.connectorId === "obsidian",
        ),
      });
      return;
    }

    await jsonRoute(route, 404, { error: "Unhandled integrations route" });
  });

  return { requests };
}

async function openSettings(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function openSettingsSection(page: Page, section: string) {
  const navButton = page.getByRole("button", {
    name: new RegExp(`^${section}$`),
  });
  await expect(navButton).toBeVisible();
  await navButton.click();
  if (section === "Integrations") {
    await expect(page.getByText("Nango", { exact: true }).first()).toBeVisible();
  } else {
    await expect(navButton).toHaveAttribute("aria-current", "page");
  }
}

test.describe("Settings Integrations", () => {
  test("configures Nango and completes a GitHub OAuth connection", async ({
    page,
  }) => {
    const { requests } = await mockApi(page);
    const signInPosts: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/sign-in") {
        signInPosts.push(request.url());
      }
    });
    page.on("popup", (popup) => {
      void popup.close();
    });

    await openSettings(page);
    await openSettingsSection(page, "Integrations");

    await expect(page.getByText("Nango not configured")).toBeVisible();
    await page.getByLabel("Nango secret key").fill("nango-test-key-not-real");
    await page.getByRole("button", { name: "Save Nango key" }).click();
    await expect(page.getByText("Nango key saved")).toBeVisible();
    await expect(page.getByText("Nango configured")).toBeVisible();

    await page
      .getByLabel("GitHub OAuth client ID")
      .fill("github-client-id-not-real");
    await page
      .getByLabel("GitHub OAuth client secret")
      .fill("github-client-secret-not-real");
    await page.getByRole("button", { name: "Save GitHub OAuth app" }).click();
    await expect(page.getByText("GitHub OAuth app saved")).toBeVisible();
    await expect(page.getByText("Ready to connect").first()).toBeVisible();

    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(page.getByText("GitHub Connect session started")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "https://connect.nango.dev/session-test" }),
    ).toBeVisible();

    await page.getByLabel("GitHub connection ID").fill("conn-github");
    await page.getByRole("button", { name: "Finish GitHub connection" }).click();
    await expect(page.getByText("GitHub account connected")).toBeVisible();
    await expect(page.getByText("default", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Test default" }).click();
    await expect(page.getByText("default health check passed")).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();

    await page.getByLabel("default memory scope").selectOption("PROJECT_ONLY");
    await expect(page.getByText("default updated")).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/integrations/nango",
      )?.body,
    ).toMatchObject({ secretKey: "nango-test-key-not-real" });
    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/integrations/github/connect-session",
      )?.body,
    ).toMatchObject({ accountAlias: "default" });
    expect(signInPosts).toEqual([]);
  });

  test("configures connector memory controls and a local Obsidian vault", async ({
    page,
  }) => {
    const { requests } = await mockApi(page);

    await openSettings(page);
    await openSettingsSection(page, "Integrations");

    await expect(page.getByText("Setup checklist").first()).toBeVisible();
    await page.getByLabel("Obsidian vault path").fill("/tmp/handle-vault");
    await page.getByRole("button", { name: "Save vault" }).click();
    await expect(page.getByText("Obsidian vault saved")).toBeVisible();
    await expect(page.getByText("Local vault", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Handle uses SafetyGovernor to", { exact: false }),
    ).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/integrations/obsidian/local-vault",
      )?.body,
    ).toMatchObject({ vaultPath: "/tmp/handle-vault" });
  });

  test("uses Nango API-token setup for Vercel without OAuth app fields", async ({
    page,
  }) => {
    const { requests } = await mockApi(page);
    page.on("popup", (popup) => {
      void popup.close();
    });

    await openSettings(page);
    await openSettingsSection(page, "Integrations");

    await expect(page.getByRole("heading", { name: "Vercel" })).toBeVisible();
    await expect(page.getByLabel("Vercel OAuth client ID")).toHaveCount(0);
    await expect(page.getByLabel("Vercel OAuth client secret")).toHaveCount(0);
    await expect(page.getByText("Redirect URI:")).toHaveCount(1);
    await expect(page.getByText("API token setup")).toBeVisible();
    await expect(
      page.getByText("Handle stores only the Nango connection ID"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Connect Vercel" }).click();
    await expect(page.getByText("Vercel Connect session started")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "https://connect.nango.dev/session-vercel" }),
    ).toBeVisible();

    await page.getByLabel("Vercel connection ID").fill("conn-vercel");
    await page.getByRole("button", { name: "Finish Vercel connection" }).click();
    await expect(page.getByText("Vercel account connected")).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/integrations/vercel/oauth-app",
      ),
    ).toBeUndefined();
    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/integrations/vercel/connect-session",
      )?.body,
    ).toMatchObject({ accountAlias: "default" });
  });
});
