import { expect, test, type Page, type Route } from "@playwright/test";
import type { SearchSettingsResponse } from "@handle/shared";

async function jsonRoute(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function requestBody(route: Route) {
  const text = route.request().postData();
  return text ? JSON.parse(text) : null;
}

function fixture(): SearchSettingsResponse {
  return {
    project: null,
    providers: [
      {
        docsUrl: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
        enabled: false,
        hasApiKey: false,
        id: "TAVILY",
        label: "Tavily",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastTestedAt: null,
        memoryScope: "NONE",
        rateLimitPerMinute: null,
        status: "missing_key",
      },
      {
        docsUrl: "https://serper.dev/",
        enabled: false,
        hasApiKey: false,
        id: "SERPER",
        label: "Serper",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastTestedAt: null,
        memoryScope: "NONE",
        rateLimitPerMinute: null,
        status: "missing_key",
      },
      {
        docsUrl: "https://brave.com/search/api/",
        enabled: false,
        hasApiKey: false,
        id: "BRAVE",
        label: "Brave Search",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastTestedAt: null,
        memoryScope: "NONE",
        rateLimitPerMinute: null,
        status: "missing_key",
      },
    ],
  };
}

async function mockSettingsApi(page: Page) {
  const requests: Array<{ body: unknown; method: string; path: string }> = [];
  const settings = fixture();

  await page.route("**/api/projects**", async (route) => {
    await jsonRoute(route, 200, { projects: [] });
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

    if (method === "GET" && path === "/api/settings/search-providers") {
      await jsonRoute(route, 200, settings);
      return;
    }

    if (method === "PUT" && path === "/api/settings/search-providers/TAVILY") {
      const provider = settings.providers.find((item) => item.id === "TAVILY");
      if (provider && body && typeof body === "object") {
        Object.assign(provider, body);
      }
      await jsonRoute(route, 200, settings);
      return;
    }

    if (method === "POST" && path === "/api/settings/search-providers/TAVILY/key") {
      const provider = settings.providers.find((item) => item.id === "TAVILY");
      if (provider) {
        provider.enabled = true;
        provider.hasApiKey = true;
        provider.status = "configured";
      }
      await jsonRoute(route, 200, settings);
      return;
    }

    if (method === "POST" && path === "/api/settings/search-providers/TAVILY/test") {
      await jsonRoute(route, 200, {
        ok: true,
        providerId: "TAVILY",
        resultCount: 1,
        sample: { title: "Handle", url: "https://example.com" },
      });
      return;
    }

    await jsonRoute(route, 404, { error: "Unhandled settings route" });
  });

  return { requests };
}

async function openSettings(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue as smoke user" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("Settings Search saves a BYOK provider and tests it", async ({ page }) => {
  const { requests } = await mockSettingsApi(page);

  await openSettings(page);
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tavily" })).toBeVisible();
  await expect(page.getByText("Missing key").first()).toBeVisible();

  await page.getByLabel("Tavily enabled").click();
  await page.getByLabel("Tavily API key").fill("tvly-test-key-not-real");
  await page.getByLabel("Tavily memory scope").selectOption("PROJECT_ONLY");
  await page.getByRole("button", { name: "Save" }).first().click();

  await expect(page.getByText("Tavily saved")).toBeVisible();
  await expect(page.getByText("Configured")).toBeVisible();

  await page.getByRole("button", { name: "Test Tavily" }).click();
  await expect(page.getByText("Tavily connected")).toBeVisible();

  expect(
    requests.find((request) => request.path === "/api/settings/search-providers/TAVILY/key")?.body,
  ).toMatchObject({ apiKey: "tvly-test-key-not-real" });
  expect(
    requests.find((request) => request.path === "/api/settings/search-providers/TAVILY")?.body,
  ).toMatchObject({
    enabled: true,
    memoryScope: "PROJECT_ONLY",
  });
});
