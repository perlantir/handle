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
        setupGuide: [],
        tier: 1,
      },
      {
        authType: "local-vault",
        connectorId: "obsidian",
        description: "Read and edit one local Obsidian vault through SafetyGovernor.",
        displayName: "Obsidian",
        nangoProviderId: null,
        requiredScopes: [],
        setupGuide: [],
        tier: 3,
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

    if (method === "POST" && path === "/api/integrations/integration-github/test") {
      await jsonRoute(route, 200, {
        integration: settings.connections[0],
        ok: true,
        profilePreview: { login: "perlantir" },
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
  await expect(navButton).toHaveAttribute("aria-current", "page");
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
    await expect(page.getByText("Ready to connect")).toBeVisible();

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
});
