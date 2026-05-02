import { expect, test, type Page, type Route } from "@playwright/test";

type ProviderId = "anthropic" | "kimi" | "local" | "openai" | "openrouter";

interface ProviderFixture {
  authMode: "apiKey" | "chatgpt-oauth";
  baseURL: string | null;
  description: string;
  enabled: boolean;
  fallbackOrder: number;
  hasApiKey: boolean;
  id: ProviderId;
  modelName: string | null;
  primaryModel: string;
  updatedAt: string;
}

interface RecordedRequest {
  body: unknown;
  method: string;
  path: string;
}

interface OAuthStatusFixture {
  accountId: string | null;
  email: string | null;
  expires: number | null;
  flowError: string | null;
  flowState: string | null;
  planType: string | null;
  port: number | null;
  signedIn: boolean;
}

const validOpenAiKey = `sk-${"o".repeat(30)}`;

function disconnectedOAuthStatus(): OAuthStatusFixture {
  return {
    accountId: null,
    email: null,
    expires: null,
    flowError: null,
    flowState: null,
    planType: null,
    port: null,
    signedIn: false,
  };
}

function connectedOAuthStatus(): OAuthStatusFixture {
  return {
    accountId: "account-123",
    email: "perlantir@example.com",
    expires: 1_800_000_000_000,
    flowError: null,
    flowState: null,
    planType: "plus",
    port: null,
    signedIn: true,
  };
}

function providerFixtures(): ProviderFixture[] {
  return [
    {
      authMode: "apiKey",
      baseURL: null,
      description: "OpenAI",
      enabled: false,
      fallbackOrder: 1,
      hasApiKey: false,
      id: "openai",
      modelName: null,
      primaryModel: "gpt-4o",
      updatedAt: "2026-05-01T12:00:00.000Z",
    },
    {
      authMode: "apiKey",
      baseURL: null,
      description: "Anthropic",
      enabled: true,
      fallbackOrder: 2,
      hasApiKey: true,
      id: "anthropic",
      modelName: null,
      primaryModel: "claude-opus-4-7",
      updatedAt: "2026-05-01T12:00:00.000Z",
    },
    {
      authMode: "apiKey",
      baseURL: "https://api.moonshot.ai/v1",
      description: "Moonshot KIMI",
      enabled: true,
      fallbackOrder: 3,
      hasApiKey: true,
      id: "kimi",
      modelName: null,
      primaryModel: "kimi-k2.6",
      updatedAt: "2026-05-01T12:00:00.000Z",
    },
    {
      authMode: "apiKey",
      baseURL: null,
      description: "OpenRouter (100+ models from many providers)",
      enabled: true,
      fallbackOrder: 4,
      hasApiKey: true,
      id: "openrouter",
      modelName: null,
      primaryModel: "anthropic/claude-opus-4.7",
      updatedAt: "2026-05-01T12:00:00.000Z",
    },
    {
      authMode: "apiKey",
      baseURL: "http://127.0.0.1:11434/v1",
      description: "Local LLM",
      enabled: true,
      fallbackOrder: 5,
      hasApiKey: false,
      id: "local",
      modelName: "Ollama",
      primaryModel: "llama3.1:8b",
      updatedAt: "2026-05-01T12:00:00.000Z",
    },
  ];
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

async function mockSettingsProvidersApi(
  page: Page,
  options: {
    oauthAfterStart?: OAuthStatusFixture;
    oauthStatus?: OAuthStatusFixture;
    testFailures?: Partial<
      Record<ProviderId, { error: string; status: number }>
    >;
  } = {},
) {
  const providers = providerFixtures();
  const requests: RecordedRequest[] = [];
  let oauthStatus = options.oauthStatus ?? disconnectedOAuthStatus();

  await page.route("**/api/settings/providers**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = await requestBody(route);

    requests.push({ body, method, path });

    if (method === "GET" && path === "/api/settings/providers") {
      await jsonRoute(route, 200, { providers });
      return;
    }

    if (path === "/api/settings/providers/openai/oauth/status") {
      await jsonRoute(route, 200, {
        providerId: "openai",
        status: oauthStatus,
      });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/settings/providers/openai/oauth/start"
    ) {
      oauthStatus = options.oauthAfterStart ?? connectedOAuthStatus();
      await jsonRoute(route, 200, {
        authUrl: "https://auth.openai.com/oauth/authorize?state=test-state",
        expiresInMs: 2_000,
        port: 1455,
        providerId: "openai",
        redirectUri: "http://localhost:1455/auth/callback",
        state: "test-state",
      });
      return;
    }

    if (
      method === "DELETE" &&
      path === "/api/settings/providers/openai/oauth/disconnect"
    ) {
      oauthStatus = disconnectedOAuthStatus();
      await jsonRoute(route, 200, { disconnected: true, providerId: "openai" });
      return;
    }

    if (
      method === "POST" &&
      path === "/api/settings/providers/openai/oauth/refresh"
    ) {
      await jsonRoute(route, 200, {
        providerId: "openai",
        status: oauthStatus,
      });
      return;
    }

    const match = path.match(
      /^\/api\/settings\/providers\/([^/]+)(?:\/(key|test))?$/,
    );
    const id = match?.[1] as ProviderId | undefined;
    const action = match?.[2];
    const provider = providers.find((item) => item.id === id);

    if (!provider || !id) {
      await jsonRoute(route, 404, { error: "Provider not found" });
      return;
    }

    if (method === "PUT" && !action) {
      Object.assign(provider, body);
      await jsonRoute(route, 200, { provider });
      return;
    }

    if (method === "POST" && action === "key") {
      provider.hasApiKey = true;
      await jsonRoute(route, 200, { providerId: id, saved: true });
      return;
    }

    if (method === "DELETE" && action === "key") {
      provider.hasApiKey = false;
      await jsonRoute(route, 200, { deleted: true, providerId: id });
      return;
    }

    if (method === "POST" && action === "test") {
      const failure = options.testFailures?.[id];
      if (failure) {
        await jsonRoute(route, failure.status, {
          error: failure.error,
          ok: false,
          providerId: id,
        });
        return;
      }

      await jsonRoute(route, 200, {
        ok: true,
        providerId: id,
        response: "OK",
      });
      return;
    }

    await jsonRoute(route, 405, { error: "Method not allowed" });
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

function providerCard(page: Page, label: string) {
  return page.locator(`article[aria-label="${label} provider settings"]`);
}

test.describe("Settings Providers", () => {
  test("renders provider cards and OpenAI auth mode choices", async ({
    page,
  }) => {
    await mockSettingsProvidersApi(page);
    await openSettings(page);

    for (const label of [
      "OpenAI",
      "Anthropic",
      "KIMI",
      "OpenRouter",
      "Local",
    ]) {
      await expect(providerCard(page, label)).toBeVisible();
      await expect(
        providerCard(page, label).getByRole("heading", { name: label }),
      ).toBeVisible();
    }

    const openai = providerCard(page, "OpenAI");
    await expect(openai.getByText("API Key", { exact: true })).toBeVisible();
    await expect(
      openai.getByText("ChatGPT Subscription", { exact: true }),
    ).toBeVisible();
    await expect(openai.getByText("Both (fallback)")).toBeVisible();
    await expect(
      openai.getByText("ChatGPT subscription not connected"),
    ).toBeVisible();
    await expect(
      openai.getByRole("button", { name: "Sign in with ChatGPT" }),
    ).toBeVisible();
    await expect(openai.locator('input[type="radio"]').nth(1)).toBeEnabled();
  });

  test("saves enabled state, model, and a valid API key", async ({ page }) => {
    const { requests } = await mockSettingsProvidersApi(page);
    await openSettings(page);

    const openai = providerCard(page, "OpenAI");
    await openai.getByRole("switch", { name: "OpenAI enabled" }).click();
    await openai.getByLabel("OpenAI API key").fill(validOpenAiKey);
    await openai.getByRole("button", { name: "Save" }).click();

    await expect(openai.getByText("Saved").first()).toBeVisible();

    expect(
      requests.find(
        (request) =>
          request.method === "PUT" &&
          request.path === "/api/settings/providers/openai",
      )?.body,
    ).toEqual({
      authMode: "apiKey",
      enabled: true,
      fallbackOrder: 1,
      primaryModel: "gpt-4o",
    });
    expect(
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/providers/openai/key",
      )?.body,
    ).toEqual({ apiKey: validOpenAiKey });
  });

  test("starts and disconnects the mocked ChatGPT Subscription OAuth flow", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.open = ((url: string | URL | undefined) => {
        window.sessionStorage.setItem("opened-oauth-url", String(url));
        return null;
      }) as typeof window.open;
    });
    const { requests } = await mockSettingsProvidersApi(page);
    await openSettings(page);

    const openai = providerCard(page, "OpenAI");
    await openai.getByLabel("ChatGPT Subscription").check();
    await openai.getByRole("button", { name: "Sign in with ChatGPT" }).click();

    await expect(
      openai.getByText("Signed in as perlantir@example.com"),
    ).toBeVisible();
    await expect(
      openai.getByText("ChatGPT subscription connected"),
    ).toBeVisible();
    await expect(
      page.evaluate(() => window.sessionStorage.getItem("opened-oauth-url")),
    ).resolves.toContain("https://auth.openai.com/oauth/authorize");
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/settings/providers/openai/oauth/start",
      ),
    ).toBe(true);

    await openai.getByRole("button", { name: "Disconnect" }).click();

    await expect(
      openai.getByText("ChatGPT subscription not connected"),
    ).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path === "/api/settings/providers/openai/oauth/disconnect",
      ),
    ).toBe(true);
  });

  test("focuses the OpenAI API key field from an OAuth-only failure", async ({
    page,
  }) => {
    await mockSettingsProvidersApi(page, {
      oauthStatus: {
        ...disconnectedOAuthStatus(),
        flowError:
          "OpenAI ChatGPT Subscription auth failed: rate limited. To enable fallback, also configure your OpenAI API key, Anthropic, OpenRouter, or another provider.",
      },
    });
    await openSettings(page);

    const openai = providerCard(page, "OpenAI");
    await expect(
      openai.getByText("OpenAI ChatGPT Subscription auth failed: rate limited"),
    ).toBeVisible();

    await openai
      .getByRole("button", { name: "Add API Key as fallback" })
      .click();

    await expect(openai.getByLabel("OpenAI API key")).toBeFocused();
    await expect(openai.getByLabel("Both (fallback)")).toBeChecked();
  });

  test("shows a mocked successful provider test response inline", async ({
    page,
  }) => {
    await mockSettingsProvidersApi(page);
    await openSettings(page);

    const anthropic = providerCard(page, "Anthropic");
    await anthropic.getByRole("button", { name: "Test Connection" }).click();

    await expect(anthropic.getByText("OK: OK")).toBeVisible();
  });

  test("shows a mocked provider test error verbatim", async ({ page }) => {
    await mockSettingsProvidersApi(page, {
      testFailures: {
        kimi: { error: "Rate limit: retry after 10s", status: 502 },
      },
    });
    await openSettings(page);

    const kimi = providerCard(page, "KIMI");
    await kimi.getByRole("button", { name: "Test Connection" }).click();

    await expect(kimi.getByText("Rate limit: retry after 10s")).toBeVisible();
  });

  test("deletes a saved provider key", async ({ page }) => {
    const { requests } = await mockSettingsProvidersApi(page);
    await openSettings(page);

    const openrouter = providerCard(page, "OpenRouter");
    await openrouter
      .getByRole("button", { name: "Delete OpenRouter key" })
      .click();

    await expect(openrouter.getByText("Key deleted")).toBeVisible();
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path === "/api/settings/providers/openrouter/key",
      ),
    ).toBe(true);
  });
});
